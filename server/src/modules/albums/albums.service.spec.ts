import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import {
  AlbumMediaType,
  AlbumVisibilityScope,
  FamilyRole,
  MediaModerationStatus,
  MemberStatus,
  Relationship,
  StorageCleanupReason,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AlbumMediaPolicy } from './album-media.policy';
import { AlbumStorageCleanupService } from './album-storage-cleanup.service';
import { AlbumsService } from './albums.service';
import { PermanentDeleteAlbumMediaDto } from './dto/album-media.dto';
import { AlbumModerationService } from './moderation/album-moderation.service';

const now = new Date('2026-07-11T00:00:00.000Z');

function familyMember(id: string, familyRole: FamilyRole) {
  return {
    id,
    familyId: 'family-1',
    userId: `user-${id}`,
    displayName: id,
    familyRole,
    relationship: Relationship.OTHER,
    status: MemberStatus.ACTIVE,
    joinedAt: now,
    leftAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function media(overrides: Record<string, unknown> = {}) {
  return {
    mediaId: 'media-1',
    workspaceId: 'family-1',
    uploadedByMemberId: 'uploader',
    mediaType: AlbumMediaType.PHOTO,
    mediaUrl: null,
    storageKey: 'album-media/family-1/file.jpg',
    originalFileName: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 100,
    thumbnailUrl: null,
    caption: null,
    visibilityScope: AlbumVisibilityScope.FAMILY,
    moderationStatus: MediaModerationStatus.PENDING,
    uploadedAt: now,
    updatedAt: now,
    deletedAt: null,
    deletedByMemberId: null,
    deleteReason: null,
    uploadedByMember: {
      id: 'uploader',
      displayName: 'Uploader',
      familyRole: FamilyRole.FAMILY_MEMBER,
      user: { fullName: 'Uploader', avatarUrl: null },
    },
    _count: { tags: 2 },
    ...overrides,
  };
}

describe('AlbumsService permissions and deletion flow', () => {
  let service: AlbumsService;
  let prisma: {
    albumMedia: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    familyMember: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let storage: {
    savePrivateFile: jest.Mock;
    deleteFileByKey: jest.Mock;
    createSignedReadUrl: jest.Mock;
  };
  let cleanup: { record: jest.Mock };

  beforeEach(() => {
    prisma = {
      albumMedia: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      familyMember: { findFirst: jest.fn() },
      $transaction: jest.fn(async (queries: Promise<unknown>[]) =>
        Promise.all(queries),
      ),
    };
    storage = {
      savePrivateFile: jest.fn(),
      deleteFileByKey: jest.fn(),
      createSignedReadUrl: jest
        .fn()
        .mockResolvedValue('https://signed.example'),
    };
    storage.deleteFileByKey.mockResolvedValue(true);
    cleanup = { record: jest.fn().mockResolvedValue(undefined) };
    service = new AlbumsService(
      prisma as unknown as PrismaService,
      storage as unknown as StorageService,
      cleanup as unknown as AlbumStorageCleanupService,
      new AlbumMediaPolicy(),
      {
        enqueueAfterUpload: jest.fn(),
      } as unknown as AlbumModerationService,
      { get: jest.fn().mockReturnValue(600) } as unknown as ConfigService,
    );
  });

  it('allows uploader to update caption', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    prisma.albumMedia.update.mockResolvedValue(media({ caption: 'Mới' }));

    const result = await service.update(
      'family-1',
      'media-1',
      familyMember('uploader', FamilyRole.FAMILY_MEMBER),
      { caption: ' Mới ' },
    );

    expect(prisma.albumMedia.update).toHaveBeenCalled();
    expect(result.tagCount).toBe(2);
    expect(result.caption).toBe('Mới');
  });

  it('does not let a manager edit another uploader media', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    await expect(
      service.update(
        'family-1',
        'media-1',
        familyMember('manager', FamilyRole.FAMILY_MANAGER),
        { caption: 'Không được phép' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows manager to soft-delete another member media', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    prisma.albumMedia.update.mockResolvedValue(
      media({ deletedAt: now, deletedByMemberId: 'manager' }),
    );
    await service.softDelete(
      'family-1',
      'media-1',
      familyMember('manager', FamilyRole.FAMILY_MANAGER),
      {},
    );
    expect(prisma.albumMedia.update).toHaveBeenCalled();
  });

  it('denies normal member deleting another member media', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    await expect(
      service.softDelete(
        'family-1',
        'media-1',
        familyMember('normal', FamilyRole.FAMILY_MEMBER),
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires soft-delete before permanent delete', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    await expect(
      service.permanentDelete(
        'family-1',
        'media-1',
        familyMember('uploader', FamilyRole.FAMILY_MEMBER),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deletes R2 strictly before deleting the database row', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(media({ deletedAt: now }));
    storage.deleteFileByKey.mockResolvedValue(undefined);
    prisma.albumMedia.delete.mockResolvedValue(media({ deletedAt: now }));

    await service.permanentDelete(
      'family-1',
      'media-1',
      familyMember('uploader', FamilyRole.FAMILY_MEMBER),
    );

    expect(storage.deleteFileByKey).toHaveBeenCalledWith(
      'album-media/family-1/file.jpg',
      true,
    );
    expect(storage.deleteFileByKey.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.albumMedia.delete.mock.invocationCallOrder[0],
    );
  });

  it('keeps DB row when strict R2 deletion fails', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(media({ deletedAt: now }));
    storage.deleteFileByKey.mockRejectedValue(new Error('R2 unavailable'));
    await expect(
      service.permanentDelete(
        'family-1',
        'media-1',
        familyMember('uploader', FamilyRole.FAMILY_MEMBER),
      ),
    ).rejects.toThrow('R2 unavailable');
    expect(prisma.albumMedia.delete).not.toHaveBeenCalled();
    expect(cleanup.record).toHaveBeenCalledWith(
      'family-1',
      'album-media/family-1/file.jpg',
      StorageCleanupReason.PERMANENT_DELETE_RETRY,
      'media-1',
    );
  });

  it('cleans up the private object when database creation fails', async () => {
    storage.savePrivateFile.mockResolvedValue({
      storageKey: 'album-media/family-1/new.jpg',
      fileName: 'new.jpg',
      mimeType: 'image/jpeg',
      size: 4,
    });
    prisma.albumMedia.create.mockRejectedValue(new Error('database failed'));
    const uploadedFile = {
      originalname: 'new.jpg',
      mimetype: 'image/jpeg',
      size: 4,
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
    };

    await expect(
      service.upload(
        'family-1',
        familyMember('uploader', FamilyRole.FAMILY_MEMBER),
        { visibilityScope: AlbumVisibilityScope.FAMILY },
        uploadedFile,
      ),
    ).rejects.toThrow('database failed');
    expect(storage.deleteFileByKey).toHaveBeenCalledWith(
      'album-media/family-1/new.jpg',
      false,
    );
  });

  it('records an orphan job when immediate upload cleanup fails', async () => {
    storage.savePrivateFile.mockResolvedValue({
      storageKey: 'album-media/family-1/orphan.jpg',
      fileName: 'orphan.jpg',
      mimeType: 'image/jpeg',
      size: 4,
    });
    storage.deleteFileByKey.mockResolvedValue(false);
    prisma.albumMedia.create.mockRejectedValue(new Error('database failed'));

    await expect(
      service.upload(
        'family-1',
        familyMember('uploader', FamilyRole.FAMILY_MEMBER),
        { visibilityScope: AlbumVisibilityScope.FAMILY },
        {
          originalname: 'orphan.jpg',
          mimetype: 'image/jpeg',
          size: 4,
          buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
        },
      ),
    ).rejects.toThrow('database failed');
    expect(cleanup.record).toHaveBeenCalledWith(
      'family-1',
      'album-media/family-1/orphan.jpg',
      StorageCleanupReason.ORPHAN_UPLOAD,
    );
  });

  it('records reconciliation when DB hard delete fails after R2 deletion', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(media({ deletedAt: now }));
    prisma.albumMedia.delete.mockRejectedValue(new Error('database failed'));

    await expect(
      service.permanentDelete(
        'family-1',
        'media-1',
        familyMember('uploader', FamilyRole.FAMILY_MEMBER),
      ),
    ).rejects.toThrow('database failed');
    expect(cleanup.record).toHaveBeenCalledWith(
      'family-1',
      'album-media/family-1/file.jpg',
      StorageCleanupReason.PERMANENT_DELETE_DB_FAILED,
      'media-1',
    );
  });

  it('does not sign original URLs for media list items', async () => {
    prisma.albumMedia.count.mockResolvedValue(1);
    prisma.albumMedia.findMany.mockResolvedValue([
      media({ moderationStatus: MediaModerationStatus.SAFE }),
    ]);

    const result = await service.list(
      'family-1',
      familyMember('normal', FamilyRole.FAMILY_MEMBER),
      {
        page: 1,
        limit: 20,
        sortOrder: 'DESC' as never,
        deletedView: 'ACTIVE' as never,
      },
    );

    expect(storage.createSignedReadUrl).not.toHaveBeenCalled();
    expect(result.items[0].fileAccess).toBeNull();
  });

  it('requires exact permanent-delete confirmation in the request DTO', async () => {
    const invalid = Object.assign(new PermanentDeleteAlbumMediaDto(), {
      confirmation: 'DELETE',
    });
    const valid = Object.assign(new PermanentDeleteAlbumMediaDto(), {
      confirmation: 'PERMANENT_DELETE',
    });
    expect(await validate(invalid)).not.toHaveLength(0);
    expect(await validate(valid)).toHaveLength(0);
  });

  it('filters by tagged member in Prisma and returns tagCount', async () => {
    const taggedMemberId = '2c46ac59-63d9-48c2-a4d4-82685876342e';
    prisma.familyMember.findFirst.mockResolvedValue({ id: taggedMemberId });
    prisma.albumMedia.count.mockResolvedValue(1);
    prisma.albumMedia.findMany.mockResolvedValue([
      media({ moderationStatus: MediaModerationStatus.SAFE }),
    ]);

    const result = await service.list(
      'family-1',
      familyMember('normal', FamilyRole.FAMILY_MEMBER),
      {
        page: 1,
        limit: 20,
        sortOrder: 'DESC' as never,
        deletedView: 'ACTIVE' as never,
        taggedMemberId,
      },
    );

    expect(prisma.familyMember.findFirst).toHaveBeenCalledWith({
      where: { id: taggedMemberId, familyId: 'family-1' },
      select: { id: true },
    });
    expect(
      prisma.albumMedia.findMany.mock.calls[0][0].where.AND,
    ).toContainEqual({ tags: { some: { taggedMemberId } } });
    expect(result.items[0].tagCount).toBe(2);
  });
});
