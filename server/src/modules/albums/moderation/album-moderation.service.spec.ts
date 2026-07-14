import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AlbumMedia,
  AlbumMediaType,
  AlbumVisibilityScope,
  FamilyRole,
  MediaCheckResult,
  MediaModerationStatus,
  MemberStatus,
  Relationship,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import {
  StorageObjectNotFoundError,
  StorageService,
} from '../../storage/storage.service';
import { AlbumMediaPolicy } from '../album-media.policy';
import { AlbumSortOrder } from '../dto/album-media.dto';
import { ManualModerationDecision } from '../dto/album-moderation.dto';
import { AlbumModerationService } from './album-moderation.service';
import { CloudflareQueueService } from './cloudflare-queue.service';
import { CloudflareWorkersAiService } from './cloudflare-workers-ai.service';
import {
  AlbumModerationJob,
  ModerationProviderError,
} from './moderation.types';
import { VideoFrameService } from './video-frame.service';

const now = new Date('2026-07-11T00:00:00.000Z');
const mediaId = '22222222-2222-4222-8222-222222222222';
const workspaceId = '33333333-3333-4333-8333-333333333333';
const jobId = '11111111-1111-4111-8111-111111111111';
const storageKey = `album-media/${workspaceId}/file.jpg`;

const job: AlbumModerationJob = {
  version: 1,
  type: 'ALBUM_MEDIA_MODERATION',
  jobId,
  mediaId,
  workspaceId,
  storageKey,
  mediaType: AlbumMediaType.PHOTO,
  requestedAt: now.toISOString(),
};

function albumMedia(overrides: Partial<AlbumMedia> = {}): AlbumMedia {
  return {
    id: mediaId,
    workspaceId,
    uploadedByMemberId: 'uploader',
    mediaType: AlbumMediaType.PHOTO,
    mediaUrl: null,
    storageKey,
    originalFileName: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 4,
    thumbnailUrl: null,
    caption: null,
    visibilityScope: AlbumVisibilityScope.FAMILY,
    moderationStatus: MediaModerationStatus.PENDING,
    uploadedAt: now,
    updatedAt: now,
    deletedAt: null,
    deletedByMemberId: null,
    deleteReason: null,
    moderationStartedAt: null,
    moderationCompletedAt: null,
    moderationAttemptCount: 0,
    lastModerationError: null,
    latestModerationJobId: jobId,
    moderationQueuedAt: now,
    ...overrides,
  };
}

function member(id: string, role: FamilyRole) {
  return {
    id,
    familyId: workspaceId,
    userId: `user-${id}`,
    displayName: id,
    familyRole: role,
    relationship: Relationship.OTHER,
    status: MemberStatus.ACTIVE,
    joinedAt: now,
    leftAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('AlbumModerationService', () => {
  let service: AlbumModerationService;
  let prisma: {
    albumMedia: Record<string, jest.Mock>;
    mediaModerationCheck: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let storage: { downloadFileByKey: jest.Mock; createSignedReadUrl: jest.Mock };
  let queue: { pushModerationJob: jest.Mock };
  let ai: { moderateImage: jest.Mock; modelName: string };
  let video: { extractFrames: jest.Mock };

  beforeEach(() => {
    prisma = {
      albumMedia: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue(albumMedia()),
      },
      mediaModerationCheck: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (input: unknown) => {
        if (typeof input === 'function') {
          return (input as (tx: unknown) => Promise<unknown>)(prisma);
        }
        return Promise.all(input as Promise<unknown>[]);
      }),
    };
    storage = {
      downloadFileByKey: jest.fn().mockResolvedValue({
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
        contentType: 'image/jpeg',
        contentLength: 4,
      }),
      createSignedReadUrl: jest.fn().mockResolvedValue('https://signed'),
    };
    queue = { pushModerationJob: jest.fn().mockResolvedValue(undefined) };
    ai = {
      modelName: '@cf/meta/llama-3.2-11b-vision-instruct',
      moderateImage: jest.fn().mockResolvedValue({
        decision: MediaCheckResult.SAFE,
        riskScore: 0.1,
        categories: [],
        reasonCode: 'SAFE_CONTENT',
        summary: 'Safe',
      }),
    };
    video = { extractFrames: jest.fn() };
    const values: Record<string, unknown> = {
      'albumModeration.maxAttempts': 3,
      'albumModeration.retryDelaySeconds': 60,
      'albumModeration.staleProcessingMinutes': 10,
      'albumModeration.reviewThreshold': 0.45,
      'albumModeration.flagThreshold': 0.8,
      'storage.signedUrlTtlSeconds': 600,
    };
    service = new AlbumModerationService(
      prisma as unknown as PrismaService,
      storage as unknown as StorageService,
      queue as unknown as CloudflareQueueService,
      ai as unknown as CloudflareWorkersAiService,
      video as unknown as VideoFrameService,
      new AlbumMediaPolicy(),
      {
        get: jest.fn(
          (key: string, fallback: unknown) => values[key] ?? fallback,
        ),
      } as unknown as ConfigService,
    );
  });

  it('transitions PHOTO PENDING → PROCESSING → SAFE', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(albumMedia());
    await expect(service.processJob(job)).resolves.toEqual({ action: 'ACK' });
    expect(prisma.mediaModerationCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resultStatus: MediaCheckResult.SAFE }),
      }),
    );
  });

  it('transitions PHOTO to FLAGGED', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(albumMedia());
    ai.moderateImage.mockResolvedValue({
      decision: MediaCheckResult.FLAGGED,
      riskScore: 0.9,
      categories: [{ code: 'GRAPHIC_VIOLENCE', score: 0.9 }],
      reasonCode: 'GRAPHIC',
      summary: 'Sensitive',
    });
    await service.processJob(job);
    expect(prisma.mediaModerationCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultStatus: MediaCheckResult.FLAGGED,
        }),
      }),
    );
  });

  it('converts ambiguous PHOTO score to NEED_REVIEW', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(albumMedia());
    ai.moderateImage.mockResolvedValue({
      decision: MediaCheckResult.SAFE,
      riskScore: 0.5,
      categories: [],
      reasonCode: 'AMBIGUOUS',
      summary: 'Ambiguous',
    });
    await service.processJob(job);
    expect(prisma.mediaModerationCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultStatus: MediaCheckResult.NEED_REVIEW,
        }),
      }),
    );
  });

  it('flags VIDEO when one frame is FLAGGED', async () => {
    const videoMedia = albumMedia({
      mediaType: AlbumMediaType.VIDEO,
      mimeType: 'video/mp4',
      storageKey: `album-media/${workspaceId}/file.mp4`,
    });
    const videoJob = {
      ...job,
      mediaType: AlbumMediaType.VIDEO,
      storageKey: videoMedia.storageKey!,
    };
    prisma.albumMedia.findFirst.mockResolvedValue(videoMedia);
    storage.downloadFileByKey.mockResolvedValue({
      buffer: Buffer.from('0000ftyp0000'),
    });
    video.extractFrames.mockResolvedValue([Buffer.from('a'), Buffer.from('b')]);
    ai.moderateImage
      .mockResolvedValueOnce({
        decision: MediaCheckResult.SAFE,
        riskScore: 0.1,
        categories: [],
        reasonCode: 'SAFE',
        summary: 'Safe',
      })
      .mockResolvedValueOnce({
        decision: MediaCheckResult.FLAGGED,
        riskScore: 0.9,
        categories: [{ code: 'SELF_HARM', score: 0.9 }],
        reasonCode: 'RISK',
        summary: 'Risk',
      });
    await service.processJob(videoJob);
    expect(prisma.mediaModerationCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultStatus: MediaCheckResult.FLAGGED,
        }),
      }),
    );
  });

  it.each([
    [MediaCheckResult.SAFE, MediaCheckResult.SAFE],
    [MediaCheckResult.NEED_REVIEW, MediaCheckResult.NEED_REVIEW],
  ])(
    'aggregates VIDEO frames as %s',
    async (frameDecision, expectedDecision) => {
      const videoMedia = albumMedia({
        mediaType: AlbumMediaType.VIDEO,
        mimeType: 'video/mp4',
        storageKey: `album-media/${workspaceId}/file.mp4`,
      });
      prisma.albumMedia.findFirst.mockResolvedValue(videoMedia);
      storage.downloadFileByKey.mockResolvedValue({
        buffer: Buffer.from('0000ftyp0000'),
      });
      video.extractFrames.mockResolvedValue([Buffer.from('frame')]);
      ai.moderateImage.mockResolvedValue({
        decision: frameDecision,
        riskScore: frameDecision === MediaCheckResult.NEED_REVIEW ? 0.5 : 0.1,
        categories: [],
        reasonCode: 'FRAME_RESULT',
        summary: 'Frame result',
      });
      await service.processJob({
        ...job,
        mediaType: AlbumMediaType.VIDEO,
        storageKey: videoMedia.storageKey!,
      });
      expect(prisma.mediaModerationCheck.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ resultStatus: expectedDecision }),
        }),
      );
    },
  );

  it('marks NEED_REVIEW when FFmpeg fails', async () => {
    const videoMedia = albumMedia({
      mediaType: AlbumMediaType.VIDEO,
      mimeType: 'video/mp4',
      storageKey: `album-media/${workspaceId}/file.mp4`,
    });
    prisma.albumMedia.findFirst.mockResolvedValue(videoMedia);
    storage.downloadFileByKey.mockResolvedValue({
      buffer: Buffer.from('0000ftyp0000'),
    });
    video.extractFrames.mockRejectedValue(
      new ModerationProviderError(
        'FFmpeg missing',
        'FFMPEG_NOT_AVAILABLE',
        false,
      ),
    );
    await service.processJob({
      ...job,
      mediaType: AlbumMediaType.VIDEO,
      storageKey: videoMedia.storageKey!,
    });
    expect(prisma.mediaModerationCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultStatus: MediaCheckResult.NEED_REVIEW,
          errorCode: 'FFMPEG_NOT_AVAILABLE',
        }),
      }),
    );
  });

  it('marks NEED_REVIEW when R2 object does not exist', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(albumMedia());
    storage.downloadFileByKey.mockRejectedValue(
      new StorageObjectNotFoundError(),
    );
    await service.processJob(job);
    expect(prisma.mediaModerationCheck.create).toHaveBeenCalled();
  });

  it('acks deleted media, old jobs and duplicate jobs', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(
      albumMedia({ deletedAt: now }),
    );
    await expect(service.processJob(job)).resolves.toEqual({ action: 'ACK' });
    prisma.albumMedia.findFirst.mockResolvedValue(
      albumMedia({
        latestModerationJobId: '44444444-4444-4444-8444-444444444444',
      }),
    );
    await expect(service.processJob(job)).resolves.toEqual({ action: 'ACK' });
    prisma.albumMedia.findFirst.mockResolvedValue(albumMedia());
    prisma.mediaModerationCheck.findUnique.mockResolvedValue({
      moderationId: 'x',
    });
    await expect(service.processJob(job)).resolves.toEqual({ action: 'ACK' });
  });

  it('reclaims stale PROCESSING jobs', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(
      albumMedia({
        moderationStatus: MediaModerationStatus.PROCESSING,
        moderationStartedAt: new Date('2026-07-10T00:00:00.000Z'),
      }),
    );
    await expect(service.processJob(job)).resolves.toEqual({ action: 'ACK' });
    expect(prisma.albumMedia.updateMany).toHaveBeenCalled();
  });

  it('retries transient provider errors before max attempts', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(albumMedia());
    ai.moderateImage.mockRejectedValue(
      new ModerationProviderError('timeout', 'AI_TIMEOUT', true),
    );
    await expect(service.processJob(job)).resolves.toEqual({
      action: 'RETRY',
      retryDelaySeconds: 60,
    });
  });

  it('moves to NEED_REVIEW after max attempts', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(
      albumMedia({ moderationAttemptCount: 2 }),
    );
    ai.moderateImage.mockRejectedValue(
      new ModerationProviderError('timeout', 'AI_TIMEOUT', true),
    );
    await expect(service.processJob(job)).resolves.toEqual({ action: 'ACK' });
    expect(prisma.mediaModerationCheck.create).toHaveBeenCalled();
  });

  it('allows manager MARK_SAFE and denies normal member manual review', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(
      albumMedia({ moderationStatus: MediaModerationStatus.FLAGGED }),
    );
    await expect(
      service.manualReview(
        workspaceId,
        mediaId,
        member('manager', FamilyRole.FAMILY_MANAGER),
        {
          decision: ManualModerationDecision.MARK_SAFE,
          reviewNote: 'Checked',
        },
      ),
    ).resolves.toMatchObject({ moderationStatus: MediaModerationStatus.SAFE });
    await expect(
      service.manualReview(
        workspaceId,
        mediaId,
        member('normal', FamilyRole.FAMILY_MEMBER),
        {
          decision: ManualModerationDecision.MARK_SAFE,
          reviewNote: 'No',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a new jobId on retry', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(
      albumMedia({ moderationStatus: MediaModerationStatus.NEED_REVIEW }),
    );
    const result = await service.retry(
      workspaceId,
      mediaId,
      member('deputy', FamilyRole.DEPUTY_MEMBER),
    );
    expect(result?.jobId).not.toBe(jobId);
    expect(queue.pushModerationJob).toHaveBeenCalled();
  });

  it('allows Manager and Deputy to list queue but denies normal member', async () => {
    prisma.albumMedia.count.mockResolvedValue(0);
    prisma.albumMedia.findMany.mockResolvedValue([]);
    const query = {
      page: 1,
      limit: 20,
      sortOrder: AlbumSortOrder.DESC,
    };
    await expect(
      service.listQueue(
        workspaceId,
        member('manager', FamilyRole.FAMILY_MANAGER),
        query,
      ),
    ).resolves.toMatchObject({ items: [], meta: { total: 0 } });
    await expect(
      service.listQueue(
        workspaceId,
        member('deputy', FamilyRole.DEPUTY_MEMBER),
        query,
      ),
    ).resolves.toMatchObject({ items: [], meta: { total: 0 } });
    await expect(
      service.listQueue(
        workspaceId,
        member('normal', FamilyRole.FAMILY_MEMBER),
        query,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns only sanitized moderation summary to uploader', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue({
      mediaId,
      uploadedByMemberId: 'uploader',
      moderationStatus: MediaModerationStatus.NEED_REVIEW,
    });
    prisma.mediaModerationCheck.findMany.mockResolvedValue([
      {
        moderationId: 'check',
        resultStatus: MediaCheckResult.NEED_REVIEW,
        provider: 'CLOUDFLARE_WORKERS_AI',
        modelName: 'model',
        confidenceScore: null,
        categories: [{ code: 'NUDITY', score: 0.5 }],
        reasonCode: 'AMBIGUOUS',
        summary: 'Cần kiểm tra',
        errorCode: 'INTERNAL_DETAIL',
        errorMessage: 'provider detail',
        reviewNote: null,
        reviewedAt: null,
        checkedAt: now,
        reviewedByMember: null,
      },
    ]);
    const result = await service.history(
      workspaceId,
      mediaId,
      member('uploader', FamilyRole.FAMILY_MEMBER),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        summary: 'Cần kiểm tra',
        reasonCode: 'AMBIGUOUS',
      }),
    );
    expect(result.items[0]).not.toHaveProperty('provider');
    expect(result.items[0]).not.toHaveProperty('errorMessage');
  });

  it('hides moderation history from another normal member', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue({
      mediaId,
      uploadedByMemberId: 'uploader',
      moderationStatus: MediaModerationStatus.FLAGGED,
    });
    await expect(
      service.history(
        workspaceId,
        mediaId,
        member('other', FamilyRole.FAMILY_MEMBER),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 for cross-family moderation history', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(null);
    await expect(
      service.history(
        'other-family',
        mediaId,
        member('uploader', FamilyRole.FAMILY_MEMBER),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('re-enqueues stale PENDING or PROCESSING media with a new jobId', async () => {
    prisma.albumMedia.findMany.mockResolvedValue([
      albumMedia({
        moderationStatus: MediaModerationStatus.PROCESSING,
        moderationStartedAt: new Date('2026-07-11T00:00:00.000Z'),
      }),
    ]);

    await expect(service.recoverStaleJobs(5)).resolves.toBe(1);

    expect(prisma.albumMedia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          storageKey: { not: null },
        }),
        take: 5,
      }),
    );
    expect(queue.pushModerationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaId,
        workspaceId,
        jobId: expect.not.stringMatching(jobId),
      }),
    );
  });

  it('completes exhausted unexpected job as NEED_REVIEW', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(albumMedia());

    await service.completePoisonedJob(
      job,
      new Error('Bearer secret token=abc'),
    );

    expect(prisma.mediaModerationCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobId,
          resultStatus: MediaCheckResult.NEED_REVIEW,
          errorMessage: expect.not.stringContaining('secret'),
        }),
      }),
    );
  });
});
