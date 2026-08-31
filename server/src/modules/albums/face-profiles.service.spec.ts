import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FaceProfileStatus,
  FamilyRole,
  MemberStatus,
  Relationship,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  DeleteFaceProfileDto,
  EnrollFaceProfileDto,
} from './dto/face-profile.dto';
import { FaceAiClientService } from './face-ai-client.service';
import { FaceEmbeddingCryptoService } from './face-embedding-crypto.service';
import { FaceProfilesService } from './face-profiles.service';

const now = new Date('2026-07-14T00:00:00.000Z');
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function member(
  id: string,
  familyRole: FamilyRole = FamilyRole.FAMILY_MEMBER,
  status: MemberStatus = MemberStatus.ACTIVE,
  familyId = 'family-1',
) {
  return {
    id,
    familyId,
    userId: `user-${id}`,
    displayName: id,
    familyRole,
    relationship: Relationship.OTHER,
    status,
    locationSharingEnabled: false,
    joinedAt: now,
    leftAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function file(overrides: Record<string, unknown> = {}) {
  return {
    originalname: 'face.png',
    mimetype: 'image/png',
    size: png.length,
    buffer: png,
    ...overrides,
  };
}

function aiResult(overrides: Record<string, unknown> = {}) {
  return {
    faceIndex: 0,
    boundingBox: { x: 0.25, y: 0.2, width: 0.4, height: 0.5 },
    embedding: [1, 0, 0],
    embeddingDimension: 3,
    detectionScore: 0.98,
    qualityScore: 0.9,
    ...overrides,
  };
}

function detectResponse(faces: Record<string, unknown>[] = [aiResult()]) {
  return {
    faces,
    modelName: 'mock-face',
    modelVersion: 'mock-v1',
  };
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    profileId: 'profile-1',
    workspaceId: 'family-1',
    memberId: 'target',
    status: FaceProfileStatus.ACTIVE,
    consentedAt: now,
    consentedByMemberId: 'requester',
    modelName: 'mock-face',
    modelVersion: 'mock-v1',
    previewStorageKey: 'face-profile-previews/family-1/preview.jpg',
    previewOriginalName: 'face.png',
    previewMimeType: 'image/png',
    previewFileSize: png.length,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

describe('FaceProfilesService', () => {
  let service: FaceProfilesService;
  let prisma: {
    familyMember: { findFirst: jest.Mock };
    memberFaceProfile: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    memberFaceEmbedding: {
      updateMany: jest.Mock;
      createMany: jest.Mock;
      count: jest.Mock;
      deleteMany: jest.Mock;
    };
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let faceAi: { extractEmbedding: jest.Mock; detectFaces: jest.Mock };
  let storage: {
    savePrivateFile: jest.Mock;
    createSignedReadUrl: jest.Mock;
    deleteFileByKey: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      familyMember: { findFirst: jest.fn() },
      memberFaceProfile: {
        upsert: jest.fn().mockResolvedValue(profile()),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      memberFaceEmbedding: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
        count: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(callback(prisma)),
      ),
    };
    faceAi = {
      extractEmbedding: jest.fn(),
      detectFaces: jest.fn().mockResolvedValue(detectResponse()),
    };
    storage = {
      savePrivateFile: jest.fn().mockResolvedValue({
        storageKey: 'face-profile-previews/family-1/new-preview.png',
        fileName: 'face.png',
        mimeType: 'image/png',
        size: png.length,
      }),
      createSignedReadUrl: jest
        .fn()
        .mockResolvedValue('https://signed.example/preview.png'),
      deleteFileByKey: jest.fn().mockResolvedValue(true),
    };
    const config = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'storage.signedUrlTtlSeconds') return defaultValue ?? 600;
        return 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
      }),
    } as unknown as ConfigService;
    const crypto = new FaceEmbeddingCryptoService(config);
    service = new FaceProfilesService(
      prisma as unknown as PrismaService,
      faceAi as unknown as FaceAiClientService,
      crypto,
      storage as unknown as StorageService,
      config,
    );
  });

  it('self enrolls 3 images and stores encrypted embeddings only', async () => {
    prisma.familyMember.findFirst.mockResolvedValue(member('target'));

    const result = await service.enroll(
      'family-1',
      'target',
      member('target'),
      [file(), file(), file()],
    );

    expect(result).toMatchObject({
      memberId: 'target',
      status: FaceProfileStatus.ACTIVE,
      isEnrolled: true,
      sampleCount: 3,
      registeredImageCount: 3,
      minRequired: 3,
      maxAllowed: 5,
      previewImage: {
        url: 'https://signed.example/preview.png',
        expiresInSeconds: 600,
        originalFileName: 'face.png',
        mimeType: 'image/png',
        fileSize: png.length,
      },
    });
    expect(faceAi.detectFaces).toHaveBeenCalledTimes(3);
    expect(storage.savePrivateFile).toHaveBeenCalledWith(
      'face-profile-previews',
      'family-1',
      expect.objectContaining({ originalname: 'face.png' }),
      expect.objectContaining({ maxSize: 5 * 1024 * 1024 }),
    );
    const rows = prisma.memberFaceEmbedding.createMany.mock.calls[0][0].data;
    expect(rows[0].encryptedEmbedding).toBeInstanceOf(Uint8Array);
    expect(rows[0]).not.toHaveProperty('embedding');
    expect(result).not.toHaveProperty('encryptedEmbedding');
    expect(result).not.toHaveProperty('encryptionIv');
  });

  it.each([FamilyRole.FAMILY_MANAGER, FamilyRole.DEPUTY_MEMBER])(
    'allows %s to enroll another member',
    async (role) => {
      prisma.familyMember.findFirst.mockResolvedValue(member('target'));

      await expect(
        service.enroll('family-1', 'target', member('requester', role), [
          file(),
          file(),
          file(),
        ]),
      ).resolves.toMatchObject({ sampleCount: 3 });
    },
  );

  it('blocks normal member enrolling another member', async () => {
    prisma.familyMember.findFirst.mockResolvedValue(member('target'));

    await expect(
      service.enroll('family-1', 'target', member('requester'), [
        file(),
        file(),
        file(),
      ]),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(faceAi.detectFaces).not.toHaveBeenCalled();
  });

  it('returns 404 for cross-family target lookup', async () => {
    prisma.familyMember.findFirst.mockResolvedValue(null);

    await expect(
      service.getProfile('family-1', 'target', member('requester')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns demo-friendly registration counts for profile status', async () => {
    prisma.familyMember.findFirst.mockResolvedValue(member('target'));
    prisma.memberFaceProfile.findUnique.mockResolvedValue({
      ...profile(),
      embeddings: [
        { embeddingId: 'embedding-1' },
        { embeddingId: 'embedding-2' },
      ],
    });

    await expect(
      service.getProfile('family-1', 'target', member('target')),
    ).resolves.toMatchObject({
      memberId: 'target',
      status: FaceProfileStatus.ACTIVE,
      isEnrolled: false,
      sampleCount: 2,
      registeredImageCount: 2,
      minRequired: 3,
      maxAllowed: 5,
      previewImage: {
        url: 'https://signed.example/preview.png',
        expiresInSeconds: 600,
      },
    });
  });

  it('returns zero counts when profile has not been enrolled', async () => {
    prisma.familyMember.findFirst.mockResolvedValue(member('target'));
    prisma.memberFaceProfile.findUnique.mockResolvedValue(null);

    await expect(
      service.getProfile('family-1', 'target', member('target')),
    ).resolves.toMatchObject({
      memberId: 'target',
      status: FaceProfileStatus.DELETED,
      isEnrolled: false,
      sampleCount: 0,
      registeredImageCount: 0,
      minRequired: 3,
      maxAllowed: 5,
      previewImage: null,
    });
  });

  it('rejects fewer than 3 or more than 5 images', async () => {
    prisma.familyMember.findFirst.mockResolvedValue(member('target'));

    await expect(
      service.enroll('family-1', 'target', member('target'), [file(), file()]),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.enroll('family-1', 'target', member('target'), [
        file(),
        file(),
        file(),
        file(),
        file(),
        file(),
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects MIME mismatch and over-size images', async () => {
    prisma.familyMember.findFirst.mockResolvedValue(member('target'));

    await expect(
      service.enroll('family-1', 'target', member('target'), [
        file({ mimetype: 'image/jpeg' }),
        file(),
        file(),
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.enroll('family-1', 'target', member('target'), [
        file({ size: 5 * 1024 * 1024 + 1 }),
        file(),
        file(),
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([0, 2])(
    'rejects AI faceCount %s and does not mutate profile',
    async (faceCount) => {
      prisma.familyMember.findFirst.mockResolvedValue(member('target'));
      faceAi.detectFaces.mockResolvedValue(
        detectResponse(
          Array.from({ length: faceCount }, (_, index) =>
            aiResult({ faceIndex: index }),
          ),
        ),
      );

      await expect(
        service.enroll('family-1', 'target', member('target'), [
          file(),
          file(),
          file(),
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.memberFaceProfile.upsert).not.toHaveBeenCalled();
    },
  );

  it('validates images without mutating profile data', async () => {
    prisma.familyMember.findFirst.mockResolvedValue(member('target'));
    faceAi.detectFaces
      .mockResolvedValueOnce(detectResponse())
      .mockResolvedValueOnce(detectResponse([]))
      .mockResolvedValueOnce(detectResponse([aiResult(), aiResult()]));

    const result = await service.validate(
      'family-1',
      'target',
      member('target'),
      [file({ originalname: 'ok.png' }), file(), file()],
    );

    expect(result).toMatchObject({
      total: 3,
      passCount: 1,
      canEnroll: false,
      minRequired: 3,
      maxAllowed: 5,
    });
    expect(result.results).toEqual([
      expect.objectContaining({
        index: 0,
        fileName: 'ok.png',
        ok: true,
        faceCount: 1,
        boundingBox: expect.any(Object),
      }),
      expect.objectContaining({
        index: 1,
        ok: false,
        faceCount: 0,
        reasonCode: 'NO_FACE_DETECTED',
      }),
      expect.objectContaining({
        index: 2,
        ok: false,
        faceCount: 2,
        reasonCode: 'MULTIPLE_FACES_DETECTED',
      }),
    ]);
    expect(prisma.memberFaceProfile.upsert).not.toHaveBeenCalled();
    expect(prisma.memberFaceEmbedding.createMany).not.toHaveBeenCalled();
  });

  it('returns per-file enrollment errors for invalid images', async () => {
    prisma.familyMember.findFirst.mockResolvedValue(member('target'));
    faceAi.detectFaces
      .mockResolvedValueOnce(detectResponse())
      .mockResolvedValueOnce(detectResponse([]));

    await expect(
      service.enroll('family-1', 'target', member('target'), [
        file({ originalname: 'ok.png' }),
        file({ originalname: 'empty-face.png' }),
        file({ originalname: 'bad.jpg', mimetype: 'image/jpeg' }),
      ]),
    ).rejects.toMatchObject({
      response: {
        message: 'Some face images are not enrollable',
        code: 'FACE_IMAGES_NOT_ENROLLABLE',
        errors: [
          expect.objectContaining({
            index: 1,
            fileName: 'empty-face.png',
            reasonCode: 'NO_FACE_DETECTED',
            faceCount: 0,
          }),
          expect.objectContaining({
            index: 2,
            fileName: 'bad.jpg',
            reasonCode: 'MIME_MISMATCH',
          }),
        ],
      },
    });
    expect(prisma.memberFaceProfile.upsert).not.toHaveBeenCalled();
  });

  it('does not mutate existing profile when Face AI times out', async () => {
    prisma.familyMember.findFirst.mockResolvedValue(member('target'));
    faceAi.detectFaces.mockRejectedValue(
      new ServiceUnavailableException('Face AI service timeout'),
    );

    await expect(
      service.enroll('family-1', 'target', member('target'), [
        file(),
        file(),
        file(),
      ]),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.memberFaceEmbedding.updateMany).not.toHaveBeenCalled();
  });

  it('re-enrolls by revoking old embeddings after new embeddings are ready', async () => {
    prisma.familyMember.findFirst.mockResolvedValue(member('target'));

    await service.enroll('family-1', 'target', member('target'), [
      file(),
      file(),
      file(),
    ]);

    expect(prisma.memberFaceEmbedding.updateMany).toHaveBeenCalledWith({
      where: { profileId: 'profile-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.memberFaceEmbedding.createMany).toHaveBeenCalled();
  });

  it('fails re-enroll with inconsistent dimensions and preserves old embeddings', async () => {
    prisma.familyMember.findFirst.mockResolvedValue(member('target'));
    faceAi.detectFaces
      .mockResolvedValueOnce(detectResponse())
      .mockResolvedValueOnce(
        detectResponse([aiResult({ embeddingDimension: 4 })]),
      )
      .mockResolvedValueOnce(detectResponse());

    await expect(
      service.enroll('family-1', 'target', member('target'), [
        file(),
        file(),
        file(),
      ]),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.memberFaceEmbedding.updateMany).not.toHaveBeenCalled();
  });

  it('disables and enables with permission and minimum sample rule', async () => {
    prisma.familyMember.findFirst.mockResolvedValue(member('target'));
    prisma.memberFaceProfile.findUnique.mockResolvedValue(profile());
    prisma.memberFaceProfile.update.mockResolvedValue(
      profile({ status: FaceProfileStatus.DISABLED }),
    );
    prisma.memberFaceEmbedding.count.mockResolvedValueOnce(3);

    await expect(
      service.disable('family-1', 'target', member('requester')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.disable(
        'family-1',
        'target',
        member('manager', FamilyRole.FAMILY_MANAGER),
      ),
    ).resolves.toMatchObject({ status: FaceProfileStatus.DISABLED });

    prisma.memberFaceEmbedding.count.mockResolvedValueOnce(2);
    await expect(
      service.enable(
        'family-1',
        'target',
        member('manager', FamilyRole.FAMILY_MANAGER),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deletes embeddings and returns no biometric data', async () => {
    prisma.familyMember.findFirst.mockResolvedValue(member('target'));
    prisma.memberFaceProfile.findUnique.mockResolvedValue(profile());
    prisma.memberFaceProfile.update.mockResolvedValue(
      profile({ status: FaceProfileStatus.DELETED, deletedAt: now }),
    );

    const result = await service.deleteProfile(
      'family-1',
      'target',
      member('target'),
    );

    expect(prisma.memberFaceEmbedding.deleteMany).toHaveBeenCalledWith({
      where: { profileId: 'profile-1' },
    });
    expect(storage.deleteFileByKey).toHaveBeenCalledWith(
      'face-profile-previews/family-1/preview.jpg',
      false,
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: FaceProfileStatus.DELETED,
      isEnrolled: false,
      sampleCount: 0,
      registeredImageCount: 0,
      minRequired: 3,
      maxAllowed: 5,
      previewImage: null,
    });
    expect(result).not.toHaveProperty('encryptedEmbedding');
    expect(result).not.toHaveProperty('embedding');
  });
});

describe('Face profile DTO consent and confirmation', () => {
  it('rejects missing or false consent', () => {
    expect(
      validateSync(plainToInstance(EnrollFaceProfileDto, {})),
    ).toHaveLength(1);
    expect(
      validateSync(
        plainToInstance(EnrollFaceProfileDto, { consentConfirmed: 'false' }),
      ),
    ).not.toHaveLength(0);
  });

  it('accepts true consent and requires delete confirmation', () => {
    expect(
      validateSync(
        plainToInstance(EnrollFaceProfileDto, { consentConfirmed: 'true' }),
      ),
    ).toHaveLength(0);
    expect(
      validateSync(
        plainToInstance(DeleteFaceProfileDto, {
          confirmation: 'DELETE_FACE_PROFILE',
        }),
      ),
    ).toHaveLength(0);
    expect(
      validateSync(
        plainToInstance(DeleteFaceProfileDto, { confirmation: 'DELETE' }),
      ),
    ).not.toHaveLength(0);
  });
});
