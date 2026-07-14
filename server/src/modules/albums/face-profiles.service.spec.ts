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
  familyRole = FamilyRole.FAMILY_MEMBER,
  status = MemberStatus.ACTIVE,
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
    faceCount: 1,
    embedding: [1, 0, 0],
    embeddingDimension: 3,
    detectionScore: 0.98,
    qualityScore: 0.9,
    modelName: 'mock-face',
    modelVersion: 'mock-v1',
    ...overrides,
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
  let faceAi: { extractEmbedding: jest.Mock };

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
      extractEmbedding: jest.fn().mockResolvedValue(aiResult()),
    };
    const crypto = new FaceEmbeddingCryptoService({
      get: jest.fn(() => 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='),
    } as unknown as ConfigService);
    service = new FaceProfilesService(
      prisma as unknown as PrismaService,
      faceAi as unknown as FaceAiClientService,
      crypto,
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
      sampleCount: 3,
    });
    expect(faceAi.extractEmbedding).toHaveBeenCalledTimes(3);
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
    expect(faceAi.extractEmbedding).not.toHaveBeenCalled();
  });

  it('returns 404 for cross-family target lookup', async () => {
    prisma.familyMember.findFirst.mockResolvedValue(null);

    await expect(
      service.getProfile('family-1', 'target', member('requester')),
    ).rejects.toBeInstanceOf(NotFoundException);
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
      faceAi.extractEmbedding.mockResolvedValue(aiResult({ faceCount }));

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

  it('does not mutate existing profile when Face AI times out', async () => {
    prisma.familyMember.findFirst.mockResolvedValue(member('target'));
    faceAi.extractEmbedding.mockRejectedValue(
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
    faceAi.extractEmbedding
      .mockResolvedValueOnce(aiResult())
      .mockResolvedValueOnce(aiResult({ embeddingDimension: 4 }))
      .mockResolvedValueOnce(aiResult());

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
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: FaceProfileStatus.DELETED,
      sampleCount: 0,
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
