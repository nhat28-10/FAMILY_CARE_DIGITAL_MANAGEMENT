import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AlbumFaceDetectionStatus,
  AlbumMediaType,
  AlbumTagSuggestionStatus,
  AlbumVisibilityScope,
  FaceProfileStatus,
  FaceScanJobStatus,
  FamilyRole,
  MediaModerationStatus,
  MemberStatus,
  NotificationType,
  Relationship,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { AlbumMediaPolicy } from './album-media.policy';
import { AlbumFaceSuggestionsService } from './album-face-suggestions.service';
import { FaceAiClientService } from './face-ai-client.service';
import { FaceEmbeddingCryptoService } from './face-embedding-crypto.service';
import { CloudflareQueueService } from './moderation/cloudflare-queue.service';
import { FACE_SCAN_JOB_TYPE } from './moderation/moderation.types';

const now = new Date('2026-07-14T00:00:00.000Z');
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function member(
  id: string,
  role = FamilyRole.FAMILY_MEMBER,
  status = MemberStatus.ACTIVE,
  familyId = 'family-1',
) {
  return {
    id,
    familyId,
    userId: `user-${id}`,
    displayName: id,
    familyRole: role,
    relationship: Relationship.OTHER,
    status,
    locationSharingEnabled: false,
    joinedAt: now,
    leftAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function selectedMember(id: string, role = FamilyRole.FAMILY_MEMBER) {
  return {
    ...member(id, role),
    user: { fullName: id, avatarUrl: null },
  };
}

function media(overrides: Record<string, unknown> = {}) {
  return {
    mediaId: 'media-1',
    workspaceId: 'family-1',
    uploadedByMemberId: 'uploader',
    mediaType: AlbumMediaType.PHOTO,
    mediaUrl: null,
    storageKey: 'album-media/family-1/photo.png',
    originalFileName: 'photo.png',
    mimeType: 'image/png',
    fileSize: png.length,
    thumbnailUrl: null,
    caption: null,
    visibilityScope: AlbumVisibilityScope.FAMILY,
    moderationStatus: MediaModerationStatus.SAFE,
    uploadedAt: now,
    updatedAt: now,
    deletedAt: null,
    deletedByMemberId: null,
    deleteReason: null,
    moderationStartedAt: null,
    moderationCompletedAt: now,
    moderationAttemptCount: 0,
    lastModerationError: null,
    latestModerationJobId: null,
    moderationQueuedAt: null,
    ...overrides,
  };
}

function scanJob(overrides: Record<string, unknown> = {}) {
  return {
    scanJobId: '11111111-1111-4111-8111-111111111111',
    workspaceId: 'family-1',
    mediaId: 'media-1',
    requestedByMemberId: 'requester',
    status: FaceScanJobStatus.PENDING,
    attemptCount: 0,
    lastError: null,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function suggestion(overrides: Record<string, unknown> = {}) {
  return {
    suggestionId: '22222222-2222-4222-8222-222222222222',
    workspaceId: 'family-1',
    detectionId: '33333333-3333-4333-8333-333333333333',
    mediaId: 'media-1',
    suggestedMemberId: 'target',
    similarityScore: { toNumber: () => 0.96 },
    secondBestScore: { toNumber: () => 0.12 },
    scoreMargin: { toNumber: () => 0.84 },
    status: AlbumTagSuggestionStatus.PENDING,
    confirmedByMemberId: null,
    confirmedAt: null,
    rejectedByMemberId: null,
    rejectedAt: null,
    createdAt: now,
    updatedAt: now,
    suggestedMember: selectedMember('target'),
    detection: {
      detectionId: '33333333-3333-4333-8333-333333333333',
      faceIndex: 0,
      boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    },
    ...overrides,
  };
}

describe('AlbumFaceSuggestionsService', () => {
  let service: AlbumFaceSuggestionsService;
  let prisma: {
    albumMedia: { findFirst: jest.Mock };
    faceScanJob: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    albumFaceDetection: {
      count: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    albumTagSuggestion: {
      count: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    memberFaceProfile: { findMany: jest.Mock };
    albumMediaTag: { findUnique: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  let queue: { pushFaceScanJob: jest.Mock };
  let storage: { downloadFileByKey: jest.Mock };
  let faceAi: { detectFaces: jest.Mock };
  let notifications: { notify: jest.Mock; dispatch: jest.Mock };
  let crypto: FaceEmbeddingCryptoService;

  beforeEach(() => {
    prisma = {
      albumMedia: { findFirst: jest.fn() },
      faceScanJob: {
        create: jest.fn().mockResolvedValue(scanJob()),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      albumFaceDetection: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          detectionId: '33333333-3333-4333-8333-333333333333',
        }),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      albumTagSuggestion: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      memberFaceProfile: { findMany: jest.fn().mockResolvedValue([]) },
      albumMediaTag: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ tagId: 'tag-1' }),
      },
      $transaction: jest.fn((input: unknown) => {
        if (Array.isArray(input)) return Promise.all(input);
        return Promise.resolve((input as (tx: unknown) => unknown)(prisma));
      }),
    };
    queue = { pushFaceScanJob: jest.fn().mockResolvedValue(undefined) };
    storage = {
      downloadFileByKey: jest
        .fn()
        .mockResolvedValue({ buffer: png, contentType: 'image/png' }),
    };
    faceAi = {
      detectFaces: jest.fn().mockResolvedValue({
        faces: [
          {
            faceIndex: 0,
            boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
            embedding: [1, 0, 0],
            embeddingDimension: 3,
            detectionScore: 0.99,
            qualityScore: 0.9,
          },
        ],
        modelName: 'mock-face',
        modelVersion: 'mock-v1',
      }),
    };
    notifications = {
      notify: jest.fn().mockResolvedValue({ ids: ['notif-1'] }),
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    crypto = new FaceEmbeddingCryptoService({
      get: jest.fn(() => 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='),
    } as unknown as ConfigService);
    service = new AlbumFaceSuggestionsService(
      prisma as unknown as PrismaService,
      new AlbumMediaPolicy(),
      queue as unknown as CloudflareQueueService,
      storage as unknown as StorageService,
      faceAi as unknown as FaceAiClientService,
      crypto,
      notifications as unknown as NotificationsService,
      {
        get: jest.fn((key: string, fallback: unknown) => {
          const values: Record<string, unknown> = {
            'faceScan.minSimilarity': 0.55,
            'faceScan.singleCandidateMinSimilarity': 0.75,
            'faceScan.minMargin': 0.08,
            'faceScan.maxAttempts': 3,
            'faceScan.staleMinutes': 10,
            'faceScan.retryDelaySeconds': 60,
            'faceScan.forceRescanLimit': 2,
            'faceScan.forceRescanCooldownSeconds': 600,
          };
          return values[key] ?? fallback;
        }),
      } as unknown as ConfigService,
    );
  });

  it('creates a PENDING scan job and pushes ALBUM_FACE_SCAN message for SAFE PHOTO', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    prisma.faceScanJob.findFirst.mockResolvedValue(null);

    const result = await service.requestScan(
      'family-1',
      'media-1',
      member('requester'),
      {},
    );

    expect(result.status).toBe(FaceScanJobStatus.PENDING);
    expect(queue.pushFaceScanJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: FACE_SCAN_JOB_TYPE,
        scanJobId: expect.any(String),
        mediaId: 'media-1',
        workspaceId: 'family-1',
      }),
    );
  });

  it('rejects VIDEO, non-SAFE, deleted, and cross-family/invisible media', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(
      media({ mediaType: AlbumMediaType.VIDEO }),
    );
    await expect(
      service.requestScan('family-1', 'media-1', member('requester'), {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.albumMedia.findFirst.mockResolvedValue(
      media({ moderationStatus: MediaModerationStatus.PENDING }),
    );
    await expect(
      service.requestScan('family-1', 'media-1', member('requester'), {}),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.albumMedia.findFirst.mockResolvedValue(null);
    await expect(
      service.requestScan('family-1', 'media-other', member('requester'), {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not create duplicate active scan jobs', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    prisma.faceScanJob.findFirst.mockResolvedValue(scanJob());

    await service.requestScan('family-1', 'media-1', member('requester'), {});

    expect(prisma.faceScanJob.create).not.toHaveBeenCalled();
    expect(queue.pushFaceScanJob).not.toHaveBeenCalled();
  });

  it('blocks force rescan for non-uploader normal member', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    await expect(
      service.requestScan('family-1', 'media-1', member('requester'), {
        force: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rate limits force rescan to 2 requests per 10 minutes per member', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    prisma.faceScanJob.findFirst.mockResolvedValue(null);

    await service.requestScan('family-1', 'media-1', member('uploader'), {
      force: true,
    });
    await service.requestScan('family-1', 'media-1', member('uploader'), {
      force: true,
    });
    await expect(
      service.requestScan('family-1', 'media-1', member('uploader'), {
        force: true,
      }),
    ).rejects.toMatchObject({
      status: 429,
      response: {
        code: 'FACE_SCAN_FORCE_RESCAN_RATE_LIMITED',
        errorCode: 'FACE_SCAN_FORCE_RESCAN_RATE_LIMITED',
        retryAfterSeconds: expect.any(Number),
        cooldownSeconds: 600,
        errors: { limit: 2, windowSeconds: 600 },
      },
    });
  });

  it('returns face scan status metadata for FE polling and retry rules', async () => {
    const startedAt = new Date();
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    prisma.faceScanJob.findFirst.mockResolvedValue(
      scanJob({ status: FaceScanJobStatus.PROCESSING, startedAt }),
    );
    prisma.albumFaceDetection.count.mockResolvedValue(1);
    prisma.albumTagSuggestion.count.mockResolvedValue(1);

    const result = await service.getScanStatus(
      'family-1',
      'media-1',
      member('requester'),
    );

    expect(result).toMatchObject({
      scanJobId: '11111111-1111-4111-8111-111111111111',
      status: FaceScanJobStatus.PROCESSING,
      statuses: [
        FaceScanJobStatus.PENDING,
        FaceScanJobStatus.PROCESSING,
        FaceScanJobStatus.COMPLETED,
        FaceScanJobStatus.FAILED,
      ],
      detectedFaceCount: 1,
      suggestionCount: 1,
      maxProcessingSeconds: 600,
      retryDelaySeconds: 60,
      forceRescanLimit: 2,
      forceRescanCooldownSeconds: 600,
      retryAllowed: false,
      retryEndpoint: '/families/family-1/albums/media/media-1/face-scan/retry',
    });
    expect(result.staleAt).toEqual(new Date(startedAt.getTime() + 600_000));
  });

  it('re-enqueues stale active face scan jobs through retry endpoint', async () => {
    const staleStartedAt = new Date(Date.now() - 11 * 60 * 1000);
    const staleJob = scanJob({
      status: FaceScanJobStatus.PROCESSING,
      startedAt: staleStartedAt,
    });
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    prisma.faceScanJob.findFirst.mockResolvedValue(staleJob);
    prisma.faceScanJob.update.mockResolvedValue(
      scanJob({ status: FaceScanJobStatus.PENDING }),
    );

    const result = await service.retryScan(
      'family-1',
      'media-1',
      member('uploader'),
    );

    expect(result.status).toBe(FaceScanJobStatus.PENDING);
    expect(prisma.faceScanJob.update).toHaveBeenCalledWith({
      where: { scanJobId: staleJob.scanJobId },
      data: expect.objectContaining({
        status: FaceScanJobStatus.PENDING,
        startedAt: null,
        completedAt: null,
        lastError: null,
      }),
    });
    expect(queue.pushFaceScanJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: FACE_SCAN_JOB_TYPE,
        scanJobId: staleJob.scanJobId,
        mediaId: 'media-1',
        workspaceId: 'family-1',
      }),
    );
  });

  it('lists detected faces with candidates while keeping flat suggestion items', async () => {
    const pendingSuggestion = suggestion();
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    prisma.albumTagSuggestion.findMany.mockResolvedValue([pendingSuggestion]);
    prisma.albumFaceDetection.findMany.mockResolvedValue([
      {
        detectionId: '33333333-3333-4333-8333-333333333333',
        workspaceId: 'family-1',
        scanJobId: '11111111-1111-4111-8111-111111111111',
        mediaId: 'media-1',
        faceIndex: 0,
        boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        detectionScore: { toNumber: () => 0.99 },
        qualityScore: { toNumber: () => 0.95 },
        modelName: 'mock-face',
        modelVersion: 'mock-v1',
        status: AlbumFaceDetectionStatus.MATCHED,
        createdAt: now,
        suggestions: [pendingSuggestion],
      },
      {
        detectionId: '44444444-4444-4444-8444-444444444444',
        workspaceId: 'family-1',
        scanJobId: '11111111-1111-4111-8111-111111111111',
        mediaId: 'media-1',
        faceIndex: 1,
        boundingBox: { x: 0.55, y: 0.2, width: 0.2, height: 0.3 },
        detectionScore: { toNumber: () => 0.98 },
        qualityScore: null,
        modelName: 'mock-face',
        modelVersion: 'mock-v1',
        status: AlbumFaceDetectionStatus.UNMATCHED,
        createdAt: now,
        suggestions: [],
      },
    ]);

    const result = await service.listSuggestions(
      'family-1',
      'media-1',
      member('requester'),
    );

    expect(result.total).toBe(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        suggestionId: pendingSuggestion.suggestionId,
        faceId: pendingSuggestion.detectionId,
        faceIndex: 0,
        similarityScore: 0.96,
      }),
    );
    expect(result.faces).toHaveLength(2);
    expect(result.faces[0]).toEqual(
      expect.objectContaining({
        faceId: '33333333-3333-4333-8333-333333333333',
        faceIndex: 0,
        status: AlbumFaceDetectionStatus.MATCHED,
        candidates: [
          expect.objectContaining({
            suggestionId: pendingSuggestion.suggestionId,
            memberId: 'target',
            score: 0.96,
            status: AlbumTagSuggestionStatus.PENDING,
          }),
        ],
      }),
    );
    expect(result.faces[1]).toEqual(
      expect.objectContaining({
        faceId: '44444444-4444-4444-8444-444444444444',
        faceIndex: 1,
        status: AlbumFaceDetectionStatus.UNMATCHED,
        candidates: [],
      }),
    );
  });

  it('processes a queue job, matches only ACTIVE same-workspace profiles, and creates a suggestion', async () => {
    const encrypted = crypto.encryptEmbedding([1, 0, 0]);
    prisma.faceScanJob.findFirst.mockResolvedValue({
      ...scanJob(),
      media: media(),
    });
    prisma.memberFaceProfile.findMany.mockResolvedValue([
      {
        profileId: 'profile-1',
        workspaceId: 'family-1',
        memberId: 'target',
        status: FaceProfileStatus.ACTIVE,
        deletedAt: null,
        member: selectedMember('target'),
        embeddings: [encrypted, encrypted, encrypted].map((item) => ({
          ...item,
          embeddingDimension: 3,
        })),
      },
    ]);

    const result = await service.processJob({
      version: 1,
      type: FACE_SCAN_JOB_TYPE,
      scanJobId: '11111111-1111-4111-8111-111111111111',
      mediaId: 'media-1',
      workspaceId: 'family-1',
      requestedAt: now.toISOString(),
    });

    expect(result.action).toBe('ACK');
    expect(prisma.albumFaceDetection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AlbumFaceDetectionStatus.MATCHED,
        }),
      }),
    );
    expect(prisma.albumTagSuggestion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          suggestedMemberId: 'target',
          status: AlbumTagSuggestionStatus.PENDING,
        }),
      }),
    );
    expect(prisma.faceScanJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: FaceScanJobStatus.COMPLETED }),
      }),
    );
  });

  it('uses a stricter threshold for the only active face profile candidate', async () => {
    const encrypted = crypto.encryptEmbedding([1, 0, 0]);
    faceAi.detectFaces.mockResolvedValue({
      faces: [
        {
          faceIndex: 0,
          boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
          embedding: [1, 0, 0],
          embeddingDimension: 3,
          detectionScore: 0.99,
          qualityScore: 0.9,
        },
        {
          faceIndex: 1,
          boundingBox: { x: 0.55, y: 0.25, width: 0.2, height: 0.3 },
          embedding: [0.6, 0.8, 0],
          embeddingDimension: 3,
          detectionScore: 0.98,
          qualityScore: 0.86,
        },
      ],
      modelName: 'mock-face',
      modelVersion: 'mock-v1',
    });
    prisma.faceScanJob.findFirst.mockResolvedValue({
      ...scanJob(),
      media: media(),
    });
    prisma.memberFaceProfile.findMany.mockResolvedValue([
      {
        profileId: 'profile-1',
        workspaceId: 'family-1',
        memberId: 'target',
        status: FaceProfileStatus.ACTIVE,
        deletedAt: null,
        member: selectedMember('target'),
        embeddings: [encrypted, encrypted, encrypted].map((item) => ({
          ...item,
          embeddingDimension: 3,
        })),
      },
    ]);

    await service.processJob({
      version: 1,
      type: FACE_SCAN_JOB_TYPE,
      scanJobId: '11111111-1111-4111-8111-111111111111',
      mediaId: 'media-1',
      workspaceId: 'family-1',
      requestedAt: now.toISOString(),
    });

    expect(prisma.albumFaceDetection.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          faceIndex: 0,
          status: AlbumFaceDetectionStatus.MATCHED,
        }),
      }),
    );
    expect(prisma.albumFaceDetection.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          faceIndex: 1,
          status: AlbumFaceDetectionStatus.UNMATCHED,
        }),
      }),
    );
    expect(prisma.albumTagSuggestion.create).toHaveBeenCalledTimes(1);
  });

  it('stores UNMATCHED when score or margin does not pass', async () => {
    const encrypted = crypto.encryptEmbedding([0, 1, 0]);
    prisma.faceScanJob.findFirst.mockResolvedValue({
      ...scanJob(),
      media: media(),
    });
    prisma.memberFaceProfile.findMany.mockResolvedValue([
      {
        member: selectedMember('target'),
        embeddings: [encrypted, encrypted, encrypted].map((item) => ({
          ...item,
          embeddingDimension: 3,
        })),
      },
    ]);

    await service.processJob({
      version: 1,
      type: FACE_SCAN_JOB_TYPE,
      scanJobId: '11111111-1111-4111-8111-111111111111',
      mediaId: 'media-1',
      workspaceId: 'family-1',
      requestedAt: now.toISOString(),
    });

    expect(prisma.albumFaceDetection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AlbumFaceDetectionStatus.UNMATCHED,
        }),
      }),
    );
    expect(prisma.albumTagSuggestion.create).not.toHaveBeenCalled();
  });

  it('confirms a pending suggestion by creating tag and notification without duplicate tag', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    prisma.albumTagSuggestion.findFirst.mockResolvedValue(suggestion());
    prisma.albumTagSuggestion.update.mockResolvedValue(
      suggestion({ status: AlbumTagSuggestionStatus.CONFIRMED }),
    );

    const result = await service.confirmSuggestion(
      'family-1',
      'media-1',
      '22222222-2222-4222-8222-222222222222',
      member('requester'),
    );

    expect(result.status).toBe(AlbumTagSuggestionStatus.CONFIRMED);
    expect(prisma.albumMediaTag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ taggedMemberId: 'target' }),
      }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      'family-1',
      ['target'],
      expect.objectContaining({ type: NotificationType.ALBUM_TAG }),
      { tx: prisma },
    );
    expect(notifications.dispatch).toHaveBeenCalledWith(['notif-1']);

    prisma.albumMediaTag.create.mockClear();
    notifications.notify.mockClear();
    prisma.albumMediaTag.findUnique.mockResolvedValue({ tagId: 'tag-1' });
    await service.confirmSuggestion(
      'family-1',
      'media-1',
      '22222222-2222-4222-8222-222222222222',
      member('requester'),
    );
    expect(prisma.albumMediaTag.create).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('rejects a pending suggestion without creating tag or notification', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    prisma.albumTagSuggestion.findFirst.mockResolvedValue(suggestion());
    prisma.albumTagSuggestion.update.mockResolvedValue(
      suggestion({ status: AlbumTagSuggestionStatus.REJECTED }),
    );

    const result = await service.rejectSuggestion(
      'family-1',
      'media-1',
      '22222222-2222-4222-8222-222222222222',
      member('requester'),
    );

    expect(result.status).toBe(AlbumTagSuggestionStatus.REJECTED);
    expect(prisma.albumMediaTag.create).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
