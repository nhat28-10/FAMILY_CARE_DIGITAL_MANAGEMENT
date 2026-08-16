import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  AlbumVisibilityScope,
  FamilyRole,
  MediaModerationStatus,
  MemberStatus,
  Prisma,
  Relationship,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AlbumMediaPolicy } from './album-media.policy';
import { AlbumCollectionsService } from './album-collections.service';

const now = new Date('2026-08-16T00:00:00.000Z');

function familyMember(id: string, familyRole: FamilyRole) {
  return {
    id,
    familyId: 'family-1',
    userId: `user-${id}`,
    displayName: id,
    familyRole,
    relationship: Relationship.OTHER,
    status: MemberStatus.ACTIVE,
    locationSharingEnabled: false,
    joinedAt: now,
    leftAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function collection(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspaceId: 'family-1',
    name: 'Đi biển',
    description: null,
    coverMediaId: null,
    createdByMemberId: 'creator',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdByMember: {
      id: 'creator',
      displayName: 'Creator',
      familyRole: FamilyRole.FAMILY_MEMBER,
      user: { fullName: 'Creator', avatarUrl: null },
    },
    _count: { media: 2 },
    ...overrides,
  };
}

describe('AlbumCollectionsService', () => {
  let service: AlbumCollectionsService;
  let prisma: {
    albumCollection: {
      create: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    albumMedia: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      albumCollection: {
        create: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      albumMedia: { findFirst: jest.fn() },
      $transaction: jest.fn(async (queries: Promise<unknown>[]) =>
        Promise.all(queries),
      ),
    };
    service = new AlbumCollectionsService(
      prisma as unknown as PrismaService,
      new AlbumMediaPolicy(),
    );
  });

  it('creates a collection with normalized name', async () => {
    prisma.albumCollection.create.mockResolvedValue(collection());

    const result = await service.create(
      'family-1',
      familyMember('creator', FamilyRole.FAMILY_MEMBER),
      { name: '  Đi   biển  ' },
    );

    expect(prisma.albumCollection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Đi biển' }),
      }),
    );
    expect(result.mediaCount).toBe(2);
  });

  it('maps duplicate collection names to conflict', async () => {
    prisma.albumCollection.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.create(
        'family-1',
        familyMember('creator', FamilyRole.FAMILY_MEMBER),
        {
          name: 'Đi biển',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('denies non-owner normal member from updating a collection', async () => {
    prisma.albumCollection.findFirst.mockResolvedValue(collection());

    await expect(
      service.update(
        'family-1',
        '11111111-1111-4111-8111-111111111111',
        familyMember('other', FamilyRole.FAMILY_MEMBER),
        { name: 'Tên mới' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows manager to set a safe media as cover', async () => {
    prisma.albumCollection.findFirst.mockResolvedValue(collection());
    prisma.albumMedia.findFirst.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      workspaceId: 'family-1',
      uploadedByMemberId: 'creator',
      visibilityScope: AlbumVisibilityScope.FAMILY,
      moderationStatus: MediaModerationStatus.SAFE,
      deletedAt: null,
    });
    prisma.albumCollection.update.mockResolvedValue(
      collection({ coverMediaId: '22222222-2222-4222-8222-222222222222' }),
    );

    await service.update(
      'family-1',
      '11111111-1111-4111-8111-111111111111',
      familyMember('manager', FamilyRole.FAMILY_MANAGER),
      { coverMediaId: '22222222-2222-4222-8222-222222222222' },
    );

    expect(prisma.albumCollection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          coverMedia: {
            connect: { id: '22222222-2222-4222-8222-222222222222' },
          },
        },
      }),
    );
  });
});
