import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import {
  StorageCleanupJob,
  StorageCleanupReason,
  StorageCleanupStatus,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import {
  sanitizeStorageError,
  StorageService,
} from '../storage/storage.service';

@Injectable()
export class AlbumStorageCleanupService {
  private readonly logger = new Logger(AlbumStorageCleanupService.name);
  private readonly enabled: boolean;
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly retryDelaySeconds: number;
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('albumCleanup.enabled', true);
    this.batchSize = Math.min(
      50,
      Math.max(1, config.get<number>('albumCleanup.batchSize', 10)),
    );
    this.maxAttempts = Math.min(
      10,
      Math.max(1, config.get<number>('albumCleanup.maxAttempts', 5)),
    );
    this.retryDelaySeconds = Math.max(
      10,
      config.get<number>('albumCleanup.retryDelaySeconds', 60),
    );
  }

  async record(
    workspaceId: string | null,
    storageKey: string,
    reason: StorageCleanupReason,
    mediaId: string | null = null,
  ): Promise<void> {
    try {
      await this.prisma.storageCleanupJob.upsert({
        where: { storageKey },
        create: {
          workspaceId,
          mediaId,
          storageKey,
          reason,
          status: StorageCleanupStatus.PENDING,
          nextRetryAt: new Date(),
        },
        update: {
          workspaceId,
          mediaId,
          reason,
          status: StorageCleanupStatus.PENDING,
          attemptCount: 0,
          lastError: null,
          nextRetryAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Không thể ghi cleanup job: ${sanitizeStorageError(error)}`,
      );
    }
  }

  @Interval('album-storage-cleanup', 60_000)
  async processBatch(): Promise<void> {
    if (!this.enabled || this.processing) return;
    this.processing = true;
    try {
      const jobs = await this.prisma.storageCleanupJob.findMany({
        where: {
          status: {
            in: [StorageCleanupStatus.PENDING, StorageCleanupStatus.FAILED],
          },
          attemptCount: { lt: this.maxAttempts },
          nextRetryAt: { lte: new Date() },
        },
        orderBy: [{ nextRetryAt: 'asc' }, { createdAt: 'asc' }],
        take: this.batchSize,
      });
      for (const job of jobs) {
        await this.claimAndProcess(job);
      }
    } catch (error) {
      this.logger.warn(
        `Album cleanup batch tạm dừng: ${sanitizeStorageError(error)}`,
      );
    } finally {
      this.processing = false;
    }
  }

  private async claimAndProcess(job: StorageCleanupJob): Promise<void> {
    const claimed = await this.prisma.storageCleanupJob.updateMany({
      where: {
        id: job.id,
        status: {
          in: [StorageCleanupStatus.PENDING, StorageCleanupStatus.FAILED],
        },
        attemptCount: job.attemptCount,
      },
      data: {
        status: StorageCleanupStatus.PROCESSING,
        attemptCount: { increment: 1 },
        lastError: null,
      },
    });
    if (claimed.count !== 1) return;

    const attempt = job.attemptCount + 1;
    try {
      await this.cleanup(job);
      await this.prisma.storageCleanupJob.update({
        where: { id: job.id },
        data: {
          status: StorageCleanupStatus.COMPLETED,
          lastError: null,
          nextRetryAt: null,
        },
      });
    } catch (error) {
      const exhausted = attempt >= this.maxAttempts;
      const delaySeconds =
        this.retryDelaySeconds * Math.min(16, 2 ** Math.max(0, attempt - 1));
      await this.prisma.storageCleanupJob.update({
        where: { id: job.id },
        data: {
          status: exhausted
            ? StorageCleanupStatus.FAILED
            : StorageCleanupStatus.PENDING,
          lastError: sanitizeStorageError(error),
          nextRetryAt: exhausted
            ? null
            : new Date(Date.now() + delaySeconds * 1000),
        },
      });
    }
  }

  private async cleanup(job: StorageCleanupJob): Promise<void> {
    if (job.reason === StorageCleanupReason.ORPHAN_UPLOAD) {
      await this.storage.deleteFileByKey(job.storageKey, true);
      return;
    }
    if (!job.workspaceId || !job.mediaId) {
      throw new Error('Cleanup reconciliation thiếu workspace hoặc media');
    }

    const media = await this.prisma.albumMedia.findFirst({
      where: { id: job.mediaId, workspaceId: job.workspaceId },
      select: { id: true, storageKey: true, deletedAt: true },
    });
    if (!media) return;
    if (!media.deletedAt || media.storageKey !== job.storageKey) {
      throw new Error('Media không còn đủ điều kiện xóa vĩnh viễn');
    }

    await this.storage.deleteFileByKey(job.storageKey, true);
    await this.prisma.albumMedia.delete({
      where: { id: job.mediaId, workspaceId: job.workspaceId },
    });
  }
}
