import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Docker from 'dockerode';

import {
  buildPaginated,
  PaginatedResult,
  skipFor,
} from '../../common/types/paginated-result';
import {
  DynamicResponse,
  withResponseMessage,
} from '../../common/types/dynamic-response';
import {
  BackupStatus,
  BackupTarget,
  ConfirmRestoreDto,
  CreateBackupDto,
  CreateRestoreDto,
  ListBackupsQueryDto,
  ListRestoresQueryDto,
  RestoreStatus,
} from './dto/backup-restore.dto';

type BackupJob = {
  backupId: string;
  target: BackupTarget;
  status: BackupStatus;
  fileName: string | null;
  filePath: string | null;
  fileSizeBytes?: number | null;
  createdByAdminId: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  note?: string;
  errorMessage: string | null;
};

type BackupView = BackupJob & {
  id: string;
};

type RestoreJob = {
  restoreId: string;
  backupId: string;
  target: BackupTarget;
  status: RestoreStatus;
  requestedByAdminId: string;
  approvedByAdminId?: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  approvedAt?: string | null;
  note?: string;
  approvalNote?: string;
  errorMessage?: string;
};

type BackupResponse = BackupView & { message: string };
type RestoreResponse = RestoreJob & { message: string };

type BackupExecutionResult = {
  status: Extract<BackupStatus, 'SUCCESS' | 'FAILED'>;
  fileName: string | null;
  filePath: string | null;
  fileSizeBytes: number | null;
  errorMessage: string | null;
};

type PgDumpResult =
  | { success: true }
  | {
      success: false;
      errorMessage: string;
      retryWithDbContainer?: boolean;
    };

type PgDumpConnection = {
  host: string;
  port: string;
  username: string;
  password: string;
  database: string;
  schema?: string;
};

const STORAGE_RELATIVE_DIR = path.join('storage', 'backups');
const BACKUP_JOBS_FILE = 'backup-jobs.json';
const RESTORE_JOBS_FILE = 'restore-jobs.json';
const DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const DEFAULT_POSTGRES_CONTAINER = 'familycare_db';
const DEFAULT_PG_DUMP_TIMEOUT_MS = 600_000;
const MAX_ERROR_DETAIL_LENGTH = 1_000;
const CONFIRM_RESTORE_TEXT = 'CONFIRM_RESTORE';
const DATABASE_BACKUP_UNAVAILABLE_MESSAGE =
  'Không thể tạo backup database vì pg_dump chưa khả dụng trong container.';
const FULL_SYSTEM_UNSUPPORTED_MESSAGE =
  'Backup FULL_SYSTEM chưa được hỗ trợ an toàn trong phase này.';
const RESTORE_CREATED_MESSAGE =
  'Tạo yêu cầu restore thành công. Hệ thống chưa thực hiện ghi đè dữ liệu.';
const RESTORE_CONFIRMED_MESSAGE =
  'Xác nhận yêu cầu restore thành công. Restore cần được thực hiện theo quy trình vận hành an toàn.';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AdminBackupRestoreService {
  private storageQueue: Promise<void> = Promise.resolve();
  private readonly docker = new Docker({ socketPath: DOCKER_SOCKET_PATH });

  constructor(private readonly config: ConfigService) {}

  async createBackup(
    adminId: string,
    dto: CreateBackupDto,
  ): Promise<DynamicResponse<BackupResponse>> {
    const backupId = randomUUID();
    const now = new Date().toISOString();
    const baseJob: BackupJob = {
      backupId,
      target: dto.target,
      status: 'RUNNING',
      fileName: null,
      filePath: null,
      fileSizeBytes: null,
      createdByAdminId: adminId,
      createdAt: now,
      startedAt: now,
      finishedAt: null,
      note: dto.note,
      errorMessage: null,
    };

    return this.withStorageLock(async () => {
      await this.ensureStorage();
      const result = await this.executeBackupTarget(baseJob);
      const finishedJob: BackupJob = {
        ...baseJob,
        ...result,
        finishedAt: new Date().toISOString(),
      };

      const jobs = await this.readBackupJobs();
      await this.writeJsonFile(this.backupJobsPath(), [finishedJob, ...jobs]);

      const message =
        finishedJob.status === 'SUCCESS'
          ? 'Tạo backup thành công.'
          : 'Tạo backup thất bại.';

      return withResponseMessage(message, {
        ...this.toBackupView(finishedJob),
        message,
      });
    });
  }

  async listBackups(
    query: ListBackupsQueryDto,
  ): Promise<PaginatedResult<BackupView>> {
    const jobs = await this.readBackupJobs();
    const filtered = jobs
      .filter((job) => !query.status || job.status === query.status)
      .filter((job) => !query.target || job.target === query.target)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const items = filtered
      .slice(
        skipFor(query.page, query.limit),
        skipFor(query.page, query.limit) + query.limit,
      )
      .map((job) => this.toBackupView(job));

    return buildPaginated(items, filtered.length, query.page, query.limit);
  }

  async getBackup(backupId: string): Promise<BackupView> {
    this.validateUuid(backupId, 'Mã backup không hợp lệ.');
    const jobs = await this.readBackupJobs();
    const job = jobs.find((item) => item.backupId === backupId);
    if (!job) {
      throw new NotFoundException('Không tìm thấy backup.');
    }
    return this.toBackupView(job);
  }

  async createRestore(
    adminId: string,
    dto: CreateRestoreDto,
  ): Promise<RestoreResponse> {
    return this.withStorageLock(async () => {
      const backup = await this.findBackupOrThrow(dto.backupId);
      this.assertBackupCanBeRestored(backup, dto.target);

      const restoreId = randomUUID();
      const now = new Date().toISOString();
      const restoreJob: RestoreJob = {
        restoreId,
        backupId: backup.backupId,
        target: dto.target,
        status: 'PENDING_APPROVAL',
        requestedByAdminId: adminId,
        approvedByAdminId: null,
        createdAt: now,
        startedAt: null,
        finishedAt: null,
        approvedAt: null,
        note: dto.note,
      };
      const jobs = await this.readRestoreJobs();
      await this.writeJsonFile(this.restoreJobsPath(), [restoreJob, ...jobs]);

      return {
        ...restoreJob,
        message: RESTORE_CREATED_MESSAGE,
      };
    });
  }

  async listRestores(
    query: ListRestoresQueryDto,
  ): Promise<PaginatedResult<RestoreJob>> {
    const jobs = await this.readRestoreJobs();
    const filtered = jobs
      .filter((job) => !query.status || job.status === query.status)
      .filter((job) => !query.target || job.target === query.target)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const items = filtered.slice(
      skipFor(query.page, query.limit),
      skipFor(query.page, query.limit) + query.limit,
    );

    return buildPaginated(items, filtered.length, query.page, query.limit);
  }

  async getRestore(restoreId: string): Promise<RestoreJob> {
    this.validateUuid(restoreId, 'Mã yêu cầu restore không hợp lệ.');
    const jobs = await this.readRestoreJobs();
    const job = jobs.find((item) => item.restoreId === restoreId);
    if (!job) {
      throw new NotFoundException('Không tìm thấy yêu cầu restore.');
    }
    return job;
  }

  async confirmRestore(
    restoreId: string,
    adminId: string,
    dto: ConfirmRestoreDto,
  ): Promise<RestoreResponse> {
    if (dto.confirmationText !== CONFIRM_RESTORE_TEXT) {
      throw new BadRequestException('Nội dung xác nhận restore không hợp lệ.');
    }

    return this.withStorageLock(async () => {
      this.validateUuid(restoreId, 'Mã yêu cầu restore không hợp lệ.');
      const jobs = await this.readRestoreJobs();
      const index = jobs.findIndex((item) => item.restoreId === restoreId);
      if (index === -1) {
        throw new NotFoundException('Không tìm thấy yêu cầu restore.');
      }

      const restore = jobs[index];
      if (
        restore.status !== 'PENDING_APPROVAL' &&
        (restore.status as string) !== 'PENDING'
      ) {
        throw new BadRequestException(
          'Yêu cầu restore không ở trạng thái chờ xác nhận.',
        );
      }

      const updated: RestoreJob = {
        ...restore,
        status: 'APPROVED',
        approvedByAdminId: adminId,
        approvedAt: new Date().toISOString(),
        approvalNote: dto.note,
      };
      jobs[index] = updated;
      await this.writeJsonFile(this.restoreJobsPath(), jobs);

      return {
        ...updated,
        message: RESTORE_CONFIRMED_MESSAGE,
      };
    });
  }

  private async executeBackupTarget(
    job: BackupJob,
  ): Promise<BackupExecutionResult> {
    switch (job.target) {
      case 'DATABASE':
        return this.createDatabaseBackup(job);
      case 'SYSTEM_CONFIG':
        return this.createSystemConfigBackup(job);
      case 'FULL_SYSTEM':
        return {
          status: 'FAILED',
          fileName: null,
          filePath: null,
          fileSizeBytes: null,
          errorMessage: FULL_SYSTEM_UNSUPPORTED_MESSAGE,
        };
      default:
        return {
          status: 'FAILED',
          fileName: null,
          filePath: null,
          fileSizeBytes: null,
          errorMessage: 'Target backup không hợp lệ.',
        };
    }
  }

  private async createDatabaseBackup(
    job: BackupJob,
  ): Promise<BackupExecutionResult> {
    const connection = this.getPgDumpConnection();
    if (!connection) {
      return {
        status: 'FAILED',
        fileName: null,
        filePath: null,
        fileSizeBytes: null,
        errorMessage:
          'Không thể tạo backup database vì cấu hình database chưa sẵn sàng.',
      };
    }

    const fileName = this.buildBackupFileName(
      'database',
      job.createdAt,
      job.backupId,
      'sql',
    );
    const filePath = this.toRelativeStoragePath(fileName);
    const absoluteFilePath = this.absolutePath(filePath);

    const storageWriteError =
      await this.validateBackupFileWritable(absoluteFilePath);
    if (storageWriteError) {
      return {
        status: 'FAILED',
        fileName: null,
        filePath: null,
        fileSizeBytes: null,
        errorMessage: storageWriteError,
      };
    }

    const result = await this.runPgDump(connection, absoluteFilePath);

    if (!result.success) {
      await this.removeGeneratedFile(filePath);
      return {
        status: 'FAILED',
        fileName: null,
        filePath: null,
        fileSizeBytes: null,
        errorMessage: result.errorMessage,
      };
    }

    return {
      status: 'SUCCESS',
      fileName,
      filePath,
      fileSizeBytes: await this.getFileSize(filePath),
      errorMessage: null,
    };
  }

  private async createSystemConfigBackup(
    job: BackupJob,
  ): Promise<BackupExecutionResult> {
    const fileName = this.buildBackupFileName(
      'system-config',
      job.createdAt,
      job.backupId,
      'json',
    );
    const filePath = this.toRelativeStoragePath(fileName);
    const payload = {
      backupId: job.backupId,
      target: job.target,
      createdByAdminId: job.createdByAdminId,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      note: job.note,
      app: {
        name: this.config.get<string>('app.name') ?? 'Family Care API',
        env: this.config.get<string>('app.env') ?? 'unknown',
        prefix: this.config.get<string>('app.prefix') ?? 'api/v1',
      },
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      warning:
        'File này chỉ chứa metadata cấu hình không nhạy cảm, không chứa env secrets.',
    };

    await this.writeJsonFile(this.absolutePath(filePath), payload);
    return {
      status: 'SUCCESS',
      fileName,
      filePath,
      fileSizeBytes: await this.getFileSize(filePath),
      errorMessage: null,
    };
  }

  private async runPgDump(
    connection: PgDumpConnection,
    absoluteFilePath: string,
  ): Promise<PgDumpResult> {
    const localResult = await this.runLocalPgDump(connection, absoluteFilePath);
    if (localResult.success || !localResult.retryWithDbContainer) {
      return localResult;
    }

    await fs.rm(absoluteFilePath, { force: true });
    const containerResult = await this.runPgDumpInDbContainer(
      connection,
      absoluteFilePath,
    );
    if (containerResult.success) {
      return containerResult;
    }

    return {
      success: false,
      errorMessage: `${localResult.errorMessage} Fallback pg_dump trong DB container cũng thất bại: ${containerResult.errorMessage}`,
    };
  }

  private runLocalPgDump(
    connection: PgDumpConnection,
    absoluteFilePath: string,
  ): Promise<PgDumpResult> {
    return new Promise((resolve) => {
      const args = [
        ...this.buildPgDumpArgs(connection),
        '--no-owner',
        '--no-privileges',
        '-f',
        absoluteFilePath,
      ];

      let settled = false;
      let timedOut = false;
      const stderrChunks: Buffer[] = [];
      const pathEnv = process.env.PATH ?? process.env.Path;
      const childEnv: NodeJS.ProcessEnv = {};
      if (pathEnv) {
        childEnv.PATH = pathEnv;
        childEnv.Path = pathEnv;
      }
      if (connection.password) {
        childEnv.PGPASSWORD = connection.password;
      }

      const child = spawn('pg_dump', args, {
        env: childEnv,
        stdio: ['ignore', 'ignore', 'pipe'],
        shell: false,
        windowsHide: true,
      });

      const finish = (result: PgDumpResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, this.pgDumpTimeoutMs());

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      child.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          finish({
            success: false,
            errorMessage: DATABASE_BACKUP_UNAVAILABLE_MESSAGE,
            retryWithDbContainer: true,
          });
          return;
        }

        finish({
          success: false,
          errorMessage: this.pgDumpFailureMessage(
            'Không thể khởi chạy tiến trình backup database.',
            error.message,
          ),
        });
      });

      child.on('close', (code) => {
        if (timedOut) {
          finish({
            success: false,
            errorMessage:
              'Không thể tạo backup database vì pg_dump chạy quá thời gian cho phép.',
          });
          return;
        }

        if (code === 0) {
          finish({ success: true });
          return;
        }

        finish({
          success: false,
          errorMessage: this.pgDumpFailureMessage(
            `Không thể tạo backup database bằng pg_dump local (exit code ${code ?? 'unknown'}).`,
            Buffer.concat(stderrChunks).toString('utf8'),
          ),
          retryWithDbContainer: this.shouldRetryWithDbContainer(
            Buffer.concat(stderrChunks).toString('utf8'),
          ),
        });
      });
    });
  }

  private async runPgDumpInDbContainer(
    connection: PgDumpConnection,
    absoluteFilePath: string,
  ): Promise<PgDumpResult> {
    const containerName =
      process.env.BACKUP_POSTGRES_CONTAINER || DEFAULT_POSTGRES_CONTAINER;
    const output = createWriteStream(absoluteFilePath, { flags: 'w' });
    const stderrChunks: Buffer[] = [];
    const stderr = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        stderrChunks.push(Buffer.from(chunk));
        callback();
      },
    });
    const outputFinished = finished(output);
    const stderrFinished = finished(stderr);

    try {
      const container = this.docker.getContainer(containerName);
      await container.inspect();
      const exec = await container.exec({
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        Env: connection.password ? [`PGPASSWORD=${connection.password}`] : [],
        Cmd: [
          'pg_dump',
          ...this.buildPgDumpArgs(connection, '127.0.0.1'),
          '--no-owner',
          '--no-privileges',
        ],
      });
      const stream = await exec.start({ hijack: true, stdin: false });
      this.docker.modem.demuxStream(stream, output, stderr);
      await this.waitForDockerExecStream(stream);
      output.end();
      stderr.end();
      await Promise.all([outputFinished, stderrFinished]);

      const inspect = await exec.inspect();
      if (inspect.ExitCode === 0) {
        return { success: true };
      }

      return {
        success: false,
        errorMessage: this.pgDumpFailureMessage(
          `pg_dump trong DB container ${containerName} thất bại (exit code ${inspect.ExitCode ?? 'unknown'}).`,
          Buffer.concat(stderrChunks).toString('utf8'),
        ),
      };
    } catch (error) {
      output.destroy();
      stderr.destroy();
      await Promise.allSettled([outputFinished, stderrFinished]);
      return {
        success: false,
        errorMessage: this.pgDumpFailureMessage(
          `Không thể chạy pg_dump trong DB container ${containerName}.`,
          error instanceof Error ? error.message : String(error),
        ),
      };
    }
  }

  private buildPgDumpArgs(
    connection: PgDumpConnection,
    hostOverride?: string,
  ): string[] {
    const args = [
      '-h',
      hostOverride ?? connection.host,
      '-p',
      connection.port,
      '-U',
      connection.username,
      '-d',
      connection.database,
    ];
    if (connection.schema) {
      args.push('-n', connection.schema);
    }
    return args;
  }

  private async waitForDockerExecStream(
    stream: NodeJS.ReadableStream,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      stream.once('end', done);
      stream.once('close', done);
      stream.once('error', fail);
    });
  }

  private async validateBackupFileWritable(
    absoluteFilePath: string,
  ): Promise<string | null> {
    try {
      const handle = await fs.open(absoluteFilePath, 'w');
      await handle.close();
      await fs.rm(absoluteFilePath, { force: true });
      return null;
    } catch (error) {
      return this.pgDumpFailureMessage(
        'Không thể ghi file backup vào thư mục storage/backups.',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private pgDumpTimeoutMs(): number {
    const raw = process.env.BACKUP_PG_DUMP_TIMEOUT_MS;
    const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_PG_DUMP_TIMEOUT_MS;
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_PG_DUMP_TIMEOUT_MS;
  }

  private shouldRetryWithDbContainer(stderr: string): boolean {
    const normalized = stderr.toLowerCase();
    return (
      normalized.includes('server version') ||
      normalized.includes('pg_dump version') ||
      normalized.includes('aborting because of server version mismatch')
    );
  }

  private pgDumpFailureMessage(message: string, detail?: string): string {
    const safeDetail = this.sanitizeErrorDetail(detail);
    return safeDetail ? `${message} Chi tiết: ${safeDetail}` : message;
  }

  private sanitizeErrorDetail(detail?: string): string | null {
    const normalized = detail?.replace(/\s+/g, ' ').trim();
    if (!normalized) return null;

    const databaseUrl =
      this.config.get<string>('database.url') ?? process.env.DATABASE_URL;
    const password = this.getPgDumpConnection()?.password;
    let sanitized = normalized;
    if (databaseUrl) {
      sanitized = sanitized.split(databaseUrl).join('[DATABASE_URL]');
    }
    if (password) {
      sanitized = sanitized.split(password).join('[DB_PASSWORD]');
    }

    return sanitized.length > MAX_ERROR_DETAIL_LENGTH
      ? `${sanitized.slice(0, MAX_ERROR_DETAIL_LENGTH)}...`
      : sanitized;
  }

  private getPgDumpConnection(): PgDumpConnection | null {
    const rawUrl =
      this.config.get<string>('database.url') ?? process.env.DATABASE_URL;
    if (!rawUrl) return null;

    try {
      const url = new URL(rawUrl);
      const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
      const username = decodeURIComponent(url.username);
      if (!database || !username || !url.hostname) return null;

      return {
        host: url.hostname,
        port: url.port || '5432',
        username,
        password: decodeURIComponent(url.password || ''),
        database,
        schema: url.searchParams.get('schema') ?? undefined,
      };
    } catch {
      return null;
    }
  }

  private assertBackupCanBeRestored(
    backup: BackupJob,
    target: BackupTarget,
  ): void {
    if (backup.status !== 'SUCCESS') {
      throw new BadRequestException(
        'Chỉ có thể tạo yêu cầu restore từ backup đã thành công.',
      );
    }

    if (backup.target !== target && backup.target !== 'FULL_SYSTEM') {
      throw new BadRequestException('Target restore không phù hợp với backup.');
    }
  }

  private async findBackupOrThrow(backupId: string): Promise<BackupJob> {
    this.validateUuid(backupId, 'Mã backup không hợp lệ.');
    const jobs = await this.readBackupJobs();
    const backup = jobs.find((job) => job.backupId === backupId);
    if (!backup) {
      throw new NotFoundException('Không tìm thấy backup.');
    }
    return backup;
  }

  private toBackupView(job: BackupJob): BackupView {
    return {
      id: job.backupId,
      ...job,
      errorMessage: job.errorMessage ?? null,
    };
  }

  private withStorageLock<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.storageQueue.then(operation, operation);
    this.storageQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async ensureStorage(): Promise<void> {
    await fs.mkdir(this.storageDir(), { recursive: true });
    await this.ensureJsonArrayFile(this.backupJobsPath());
    await this.ensureJsonArrayFile(this.restoreJobsPath());
  }

  private async ensureJsonArrayFile(filePath: string): Promise<void> {
    try {
      await fs.access(filePath);
    } catch {
      await this.writeJsonFile(filePath, []);
    }
  }

  private async readBackupJobs(): Promise<BackupJob[]> {
    await this.ensureStorage();
    return this.readJsonArray<BackupJob>(this.backupJobsPath());
  }

  private async readRestoreJobs(): Promise<RestoreJob[]> {
    await this.ensureStorage();
    return this.readJsonArray<RestoreJob>(this.restoreJobsPath());
  }

  private async readJsonArray<T>(filePath: string): Promise<T[]> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      throw new InternalServerErrorException(
        'Không thể đọc dữ liệu backup/restore.',
      );
    }
  }

  private async writeJsonFile(filePath: string, data: unknown): Promise<void> {
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }

  private async getFileSize(relativePath: string): Promise<number | null> {
    try {
      const stat = await fs.stat(this.absolutePath(relativePath));
      return stat.size;
    } catch {
      return null;
    }
  }

  private async removeGeneratedFile(relativePath: string): Promise<void> {
    try {
      await fs.rm(this.absolutePath(relativePath), { force: true });
    } catch {
      // Ignore cleanup failures for generated backup artifacts.
    }
  }

  private buildBackupFileName(
    target: string,
    createdAt: string,
    backupId: string,
    extension: string,
  ): string {
    const timestamp = createdAt.replace(/[:.]/g, '-');
    return `backup-${target}-${timestamp}-${backupId.slice(0, 8)}.${extension}`;
  }

  private validateUuid(value: string, message: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException(message);
    }
  }

  private storageDir(): string {
    return path.join(process.cwd(), STORAGE_RELATIVE_DIR);
  }

  private backupJobsPath(): string {
    return path.join(this.storageDir(), BACKUP_JOBS_FILE);
  }

  private restoreJobsPath(): string {
    return path.join(this.storageDir(), RESTORE_JOBS_FILE);
  }

  private toRelativeStoragePath(fileName: string): string {
    return path.join(STORAGE_RELATIVE_DIR, fileName).replace(/\\/g, '/');
  }

  private absolutePath(relativePath: string): string {
    return path.join(process.cwd(), relativePath);
  }
}
