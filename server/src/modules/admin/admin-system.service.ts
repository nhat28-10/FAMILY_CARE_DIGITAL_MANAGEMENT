import * as os from 'node:os';

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminSystemService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth() {
    const started = Date.now();
    let database = {
      status: 'UP',
      latencyMs: null as number | null,
    };

    try {
      await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);
      database = {
        status: 'UP',
        latencyMs: Date.now() - started,
      };
    } catch {
      database = {
        status: 'DOWN',
        latencyMs: null,
      };
    }

    const isHealthy = database.status === 'UP';
    return {
      backend: {
        status: 'UP',
        uptimeSeconds: Math.floor(process.uptime()),
      },
      database,
      message: isHealthy
        ? 'Hệ thống đang hoạt động bình thường.'
        : 'Backend đang hoạt động nhưng database không khả dụng.',
    };
  }

  getRuntime() {
    const memory = process.memoryUsage();
    const uptimeSeconds = Math.floor(process.uptime());
    return {
      nodeVersion: process.version,
      node_version: process.version,
      pid: process.pid,
      uptime: uptimeSeconds,
      memoryUsage: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
      },
      node: {
        version: process.version,
        environment: process.env.NODE_ENV ?? 'development',
      },
      process: {
        uptimeSeconds,
        pid: process.pid,
      },
      memory: {
        rssMb: this.bytesToMb(memory.rss),
        heapUsedMb: this.bytesToMb(memory.heapUsed),
        heapTotalMb: this.bytesToMb(memory.heapTotal),
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        cpuCount: os.cpus().length,
      },
    };
  }

  private bytesToMb(bytes: number): number {
    return Math.round((bytes / 1024 / 1024) * 100) / 100;
  }
}
