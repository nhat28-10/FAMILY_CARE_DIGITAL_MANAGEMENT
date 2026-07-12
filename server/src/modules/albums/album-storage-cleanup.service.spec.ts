import { ConfigService } from '@nestjs/config';
import { StorageCleanupReason, StorageCleanupStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AlbumStorageCleanupService } from './album-storage-cleanup.service';

const now = new Date('2026-07-12T00:00:00.000Z');

function cleanupJob(overrides: Record<string, unknown> = {}) {
  return {
    cleanupJobId: 'cleanup-1',
    workspaceId: 'family-1',
    mediaId: null,
    storageKey: 'album-media/family-1/orphan.jpg',
    reason: StorageCleanupReason.ORPHAN_UPLOAD,
    status: StorageCleanupStatus.PENDING,
    attemptCount: 0,
    lastError: null,
    nextRetryAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('AlbumStorageCleanupService', () => {
  let service: AlbumStorageCleanupService;
  let prisma: {
    storageCleanupJob: Record<string, jest.Mock>;
    albumMedia: Record<string, jest.Mock>;
  };
  let storage: { deleteFileByKey: jest.Mock };

  beforeEach(() => {
    prisma = {
      storageCleanupJob: {
        upsert: jest.fn().mockResolvedValue(cleanupJob()),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue(cleanupJob()),
      },
      albumMedia: {
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
    };
    storage = { deleteFileByKey: jest.fn().mockResolvedValue(true) };
    const values: Record<string, unknown> = {
      'albumCleanup.enabled': true,
      'albumCleanup.batchSize': 10,
      'albumCleanup.maxAttempts': 3,
      'albumCleanup.retryDelaySeconds': 60,
    };
    service = new AlbumStorageCleanupService(
      prisma as unknown as PrismaService,
      storage as unknown as StorageService,
      {
        get: jest.fn(
          (key: string, fallback: unknown) => values[key] ?? fallback,
        ),
      } as unknown as ConfigService,
    );
  });

  it('records durable cleanup without URL or credentials', async () => {
    await service.record(
      'family-1',
      'album-media/family-1/orphan.jpg',
      StorageCleanupReason.ORPHAN_UPLOAD,
    );

    expect(prisma.storageCleanupJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storageKey: 'album-media/family-1/orphan.jpg' },
        create: expect.not.objectContaining({ signedUrl: expect.anything() }),
      }),
    );
  });

  it('claims and deletes orphan object idempotently', async () => {
    prisma.storageCleanupJob.findMany.mockResolvedValue([cleanupJob()]);

    await service.processBatch();

    expect(storage.deleteFileByKey).toHaveBeenCalledWith(
      'album-media/family-1/orphan.jpg',
      true,
    );
    expect(prisma.storageCleanupJob.update).toHaveBeenLastCalledWith({
      where: { cleanupJobId: 'cleanup-1' },
      data: {
        status: StorageCleanupStatus.COMPLETED,
        lastError: null,
        nextRetryAt: null,
      },
    });
  });

  it('reconciles permanent delete with workspace-scoped media query', async () => {
    prisma.storageCleanupJob.findMany.mockResolvedValue([
      cleanupJob({
        mediaId: 'media-1',
        reason: StorageCleanupReason.PERMANENT_DELETE_RETRY,
        storageKey: 'album-media/family-1/file.jpg',
      }),
    ]);
    prisma.albumMedia.findFirst.mockResolvedValue({
      mediaId: 'media-1',
      storageKey: 'album-media/family-1/file.jpg',
      deletedAt: now,
    });

    await service.processBatch();

    expect(prisma.albumMedia.findFirst).toHaveBeenCalledWith({
      where: { mediaId: 'media-1', workspaceId: 'family-1' },
      select: { mediaId: true, storageKey: true, deletedAt: true },
    });
    expect(storage.deleteFileByKey.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.albumMedia.delete.mock.invocationCallOrder[0],
    );
  });

  it('sanitizes failures and schedules bounded backoff', async () => {
    prisma.storageCleanupJob.findMany.mockResolvedValue([cleanupJob()]);
    storage.deleteFileByKey.mockRejectedValue(
      new Error('Bearer secret-token token=abc'),
    );

    await service.processBatch();

    expect(prisma.storageCleanupJob.update).toHaveBeenLastCalledWith({
      where: { cleanupJobId: 'cleanup-1' },
      data: expect.objectContaining({
        status: StorageCleanupStatus.PENDING,
        lastError: expect.not.stringContaining('secret-token'),
        nextRetryAt: expect.any(Date),
      }),
    });
  });
});
