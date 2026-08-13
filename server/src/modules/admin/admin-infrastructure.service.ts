import * as fs from 'node:fs';
import * as os from 'node:os';

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import Docker from 'dockerode';

import { DockerContainerLogsQueryDto } from './dto/docker-container-logs-query.dto';

const DOCKER_SOCKET_PATH = '/var/run/docker.sock';

type DockerNetworkCounter = {
  rx_bytes?: number;
  tx_bytes?: number;
};

type DockerLogStream = 'stdout' | 'stderr' | 'unknown';

type DockerLogChunk = {
  stream: DockerLogStream;
  text: string;
};

type DockerLogLine = {
  timestamp: string | null;
  stream: DockerLogStream;
  message: string;
};

const SENSITIVE_LOG_KEYWORDS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'ACCESS_TOKEN_SECRET',
  'REFRESH_TOKEN_SECRET',
  'password',
  'token',
  'secret',
  'api_key',
  'private_key',
];

export interface DockerUnavailableResponse {
  dockerAvailable: false;
  status: 'UNAVAILABLE';
  reason: 'DISABLED' | 'SOCKET_MISSING' | 'SOCKET_PERMISSION' | 'PING_FAILED';
  socketPath: string;
  message: string;
}

@Injectable()
export class AdminInfrastructureService {
  private readonly dockerSocketPath =
    process.env.DOCKER_SOCKET_PATH || DOCKER_SOCKET_PATH;
  private readonly docker = new Docker({ socketPath: this.dockerSocketPath });

  getHost() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = Math.max(totalMem - freeMem, 0);

    return {
      os: {
        platform: os.platform(),
        hostname: os.hostname(),
      },
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model ?? null,
        cpuCount: cpus.length,
        loadAverage: os.loadavg().map((value) => this.round(value)),
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        totalMb: this.bytesToMb(totalMem),
        freeMb: this.bytesToMb(freeMem),
        usedMb: this.bytesToMb(usedMem),
        usedPercent: this.percent(usedMem, totalMem),
      },
      disk: this.getDiskUsage(),
      uptimeSeconds: Math.floor(os.uptime()),
      message: 'Đã lấy thông tin tài nguyên hệ thống.',
    };
  }

  async listDockerContainers() {
    const availability = await this.getDockerAvailability();
    if (!availability.dockerAvailable) {
      return {
        ...availability,
        items: [],
      };
    }

    try {
      const containers = await this.docker.listContainers({ all: true });
      return {
        dockerAvailable: true,
        items: containers.map((container) => ({
          id: container.Id,
          name: this.primaryContainerName(container.Names),
          image: container.Image,
          state: container.State,
          status: container.Status,
          createdAt: new Date(container.Created * 1000),
        })),
      };
    } catch {
      return {
        ...this.dockerUnavailable(),
        items: [],
      };
    }
  }

  async getDockerContainerStats(containerId: string) {
    const availability = await this.getDockerAvailability();
    if (!availability.dockerAvailable) {
      return availability;
    }

    const container = this.docker.getContainer(containerId);
    try {
      const [inspect, stats] = await Promise.all([
        container.inspect(),
        container.stats({ stream: false }),
      ]);

      return {
        containerId: inspect.Id,
        name: this.cleanContainerName(inspect.Name),
        cpu: {
          cpuPercent: this.calculateCpuPercent(stats),
        },
        memory: this.calculateMemory(stats),
        network: this.calculateNetwork(stats),
        blockIo: this.calculateBlockIo(stats),
        message: 'Đã lấy thống kê container thành công.',
      };
    } catch (error) {
      if (this.isDockerNotFound(error)) {
        throw new NotFoundException('Không tìm thấy Docker container.');
      }
      return availability;
    }
  }

  async getDockerContainerLogs(
    containerId: string,
    query: DockerContainerLogsQueryDto,
  ) {
    const normalizedContainerId = containerId?.trim();
    if (!normalizedContainerId) {
      throw new BadRequestException('Tham số lấy log container không hợp lệ.');
    }

    if (!query.stdout && !query.stderr) {
      throw new BadRequestException(
        'Phải chọn ít nhất stdout hoặc stderr để lấy log.',
      );
    }

    const availability = await this.getDockerAvailability();
    if (!availability.dockerAvailable) {
      return availability;
    }

    const container = this.docker.getContainer(normalizedContainerId);

    try {
      const inspect = await container.inspect();
      const logsBuffer = await container.logs({
        follow: false,
        stdout: query.stdout,
        stderr: query.stderr,
        timestamps: query.timestamps,
        tail: query.tail,
        since: query.since,
        until: query.until,
      });

      const chunks = inspect.Config?.Tty
        ? this.plainLogChunks(logsBuffer)
        : (this.parseDockerMultiplexedLogs(logsBuffer) ??
          this.plainLogChunks(logsBuffer));
      const logs = this.toDockerLogLines(chunks, query.timestamps, query.tail);

      return {
        containerId: inspect.Id,
        name: this.cleanContainerName(inspect.Name),
        tail: query.tail,
        timestamps: query.timestamps,
        stdout: query.stdout,
        stderr: query.stderr,
        since: query.since,
        until: query.until,
        logs,
        message: 'Đã lấy log container thành công.',
      };
    } catch (error) {
      if (this.isDockerNotFound(error)) {
        throw new NotFoundException('Không tìm thấy container.');
      }

      throw new InternalServerErrorException('Không thể lấy log container.');
    }
  }

  private parseDockerMultiplexedLogs(buffer: Buffer): DockerLogChunk[] | null {
    const chunks: DockerLogChunk[] = [];
    let offset = 0;

    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) {
        return null;
      }

      const streamType = buffer[offset];
      const payloadLength = buffer.readUInt32BE(offset + 4);
      const payloadStart = offset + 8;
      const payloadEnd = payloadStart + payloadLength;

      if (
        payloadLength < 0 ||
        payloadEnd > buffer.length ||
        (streamType !== 1 && streamType !== 2)
      ) {
        return null;
      }

      chunks.push({
        stream: streamType === 1 ? 'stdout' : 'stderr',
        text: buffer.subarray(payloadStart, payloadEnd).toString('utf8'),
      });
      offset = payloadEnd;
    }

    return chunks;
  }

  private plainLogChunks(buffer: Buffer): DockerLogChunk[] {
    return [
      {
        stream: 'unknown',
        text: buffer.toString('utf8'),
      },
    ];
  }

  private toDockerLogLines(
    chunks: DockerLogChunk[],
    timestamps: boolean,
    tail: number,
  ): DockerLogLine[] {
    const lines = chunks.flatMap((chunk) =>
      chunk.text
        .split(/\r?\n/)
        .filter((line) => line.length > 0)
        .map((line) => this.toDockerLogLine(line, chunk.stream, timestamps)),
    );

    return lines.slice(-tail);
  }

  private toDockerLogLine(
    line: string,
    stream: DockerLogStream,
    timestamps: boolean,
  ): DockerLogLine {
    const parsed = timestamps ? this.extractDockerTimestamp(line) : null;
    const message = parsed ? parsed.message : line;

    return {
      timestamp: parsed?.timestamp ?? null,
      stream,
      message: this.redactLogMessage(message),
    };
  }

  private extractDockerTimestamp(
    line: string,
  ): { timestamp: string; message: string } | null {
    const match = line.match(
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s?(.*)$/,
    );
    if (!match) return null;

    const timestamp = this.normalizeDockerTimestamp(match[1]);
    if (!timestamp) return null;

    return {
      timestamp,
      message: match[2] ?? '',
    };
  }

  private normalizeDockerTimestamp(value: string): string | null {
    const match = value.match(
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/,
    );
    if (!match) return null;

    const milliseconds = (match[2] ?? '0').padEnd(3, '0').slice(0, 3);
    const date = new Date(`${match[1]}.${milliseconds}Z`);
    if (Number.isNaN(date.getTime())) return null;

    return date.toISOString();
  }

  private redactLogMessage(message: string): string {
    const lowerMessage = message.toLowerCase();
    const hasSensitiveData = SENSITIVE_LOG_KEYWORDS.some((keyword) =>
      lowerMessage.includes(keyword.toLowerCase()),
    );

    return hasSensitiveData ? '[REDACTED]' : message;
  }

  private async getDockerAvailability(): Promise<
    { dockerAvailable: true } | DockerUnavailableResponse
  > {
    if (process.env.ADMIN_DOCKER_ENABLED === 'false') {
      return this.dockerUnavailable('DISABLED');
    }

    if (!fs.existsSync(this.dockerSocketPath)) {
      return this.dockerUnavailable('SOCKET_MISSING');
    }

    try {
      fs.accessSync(
        this.dockerSocketPath,
        fs.constants.R_OK | fs.constants.W_OK,
      );
    } catch {
      return this.dockerUnavailable('SOCKET_PERMISSION');
    }

    try {
      await this.docker.ping();
      return { dockerAvailable: true };
    } catch {
      return this.dockerUnavailable('PING_FAILED');
    }
  }

  private dockerUnavailable(
    reason: DockerUnavailableResponse['reason'] = 'PING_FAILED',
  ): DockerUnavailableResponse {
    return {
      dockerAvailable: false,
      status: 'UNAVAILABLE',
      reason,
      socketPath: this.dockerSocketPath,
      message:
        'Docker socket không khả dụng hoặc server không có quyền truy cập Docker.',
    };
  }

  private getDiskUsage() {
    try {
      if (typeof fs.statfsSync !== 'function') {
        return {
          status: 'UNAVAILABLE',
          message:
            'Không thể lấy thông tin dung lượng ổ đĩa trong môi trường hiện tại.',
        };
      }

      const stat = fs.statfsSync(process.cwd());
      const total = stat.blocks * stat.bsize;
      const free = stat.bavail * stat.bsize;
      const used = Math.max(total - free, 0);

      return {
        total,
        free,
        used,
        totalMb: this.bytesToMb(total),
        freeMb: this.bytesToMb(free),
        usedMb: this.bytesToMb(used),
        usedPercent: this.percent(used, total),
      };
    } catch {
      return {
        status: 'UNAVAILABLE',
        message: 'Không thể lấy thông tin dung lượng ổ đĩa.',
      };
    }
  }

  private calculateCpuPercent(stats: Docker.ContainerStats): number {
    const cpuDelta =
      (stats.cpu_stats?.cpu_usage?.total_usage ?? 0) -
      (stats.precpu_stats?.cpu_usage?.total_usage ?? 0);
    const systemDelta =
      (stats.cpu_stats?.system_cpu_usage ?? 0) -
      (stats.precpu_stats?.system_cpu_usage ?? 0);
    const onlineCpus =
      stats.cpu_stats?.online_cpus ??
      stats.cpu_stats?.cpu_usage?.percpu_usage?.length ??
      0;

    if (cpuDelta <= 0 || systemDelta <= 0 || onlineCpus <= 0) return 0;
    return this.round((cpuDelta / systemDelta) * onlineCpus * 100);
  }

  private calculateMemory(stats: Docker.ContainerStats) {
    const usage = stats.memory_stats?.usage ?? 0;
    const limit = stats.memory_stats?.limit ?? 0;
    return {
      usageMb: this.bytesToMb(usage),
      limitMb: this.bytesToMb(limit),
      usagePercent: this.percent(usage, limit),
    };
  }

  private calculateNetwork(stats: Docker.ContainerStats) {
    const networks = Object.values(
      (stats.networks ?? {}) as Record<string, DockerNetworkCounter>,
    );
    const rx = networks.reduce(
      (sum: number, item) => sum + (item.rx_bytes ?? 0),
      0,
    );
    const tx = networks.reduce(
      (sum: number, item) => sum + (item.tx_bytes ?? 0),
      0,
    );
    return {
      rxMb: this.bytesToMb(rx),
      txMb: this.bytesToMb(tx),
    };
  }

  private calculateBlockIo(stats: Docker.ContainerStats) {
    const entries = stats.blkio_stats?.io_service_bytes_recursive ?? [];
    const read = entries
      .filter((item) => item.op?.toLowerCase() === 'read')
      .reduce((sum, item) => sum + (item.value ?? 0), 0);
    const write = entries
      .filter((item) => item.op?.toLowerCase() === 'write')
      .reduce((sum, item) => sum + (item.value ?? 0), 0);

    return {
      readMb: this.bytesToMb(read),
      writeMb: this.bytesToMb(write),
    };
  }

  private primaryContainerName(names?: string[]): string | null {
    return names?.[0] ? this.cleanContainerName(names[0]) : null;
  }

  private cleanContainerName(name?: string): string | null {
    if (!name) return null;
    return name.startsWith('/') ? name.slice(1) : name;
  }

  private isDockerNotFound(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      (error as { statusCode?: number }).statusCode === 404
    );
  }

  private bytesToMb(bytes: number): number {
    return this.round(bytes / 1024 / 1024);
  }

  private percent(value: number, total: number): number {
    if (!total) return 0;
    return this.round((value / total) * 100);
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
