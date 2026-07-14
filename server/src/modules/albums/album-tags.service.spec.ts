import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AlbumMediaType,
  AlbumVisibilityScope,
  FamilyRole,
  MediaModerationStatus,
  MemberStatus,
  NotificationPriority,
  NotificationType,
  Prisma,
  Relationship,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AlbumMediaPolicy } from './album-media.policy';
import { AlbumTagsService } from './album-tags.service';

const now = new Date('2026-07-12T00:00:00.000Z');

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
    joinedAt: now,
    leftAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function selectedMember(
  id: string,
  familyRole: FamilyRole = FamilyRole.FAMILY_MEMBER,
  status: MemberStatus = MemberStatus.ACTIVE,
) {
  return {
    id,
    familyId: 'family-1',
    displayName: id,
    familyRole,
    status,
    user: { fullName: id, avatarUrl: null },
  };
}

function media(overrides: Record<string, unknown> = {}) {
  return {
    id: 'media-1',
    workspaceId: 'family-1',
    uploadedByMemberId: 'uploader',
    mediaType: AlbumMediaType.PHOTO,
    mediaUrl: null,
    storageKey: 'album-media/family-1/photo.jpg',
    originalFileName: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 100,
    thumbnailUrl: null,
    caption: null,
    visibilityScope: AlbumVisibilityScope.FAMILY,
    moderationStatus: MediaModerationStatus.SAFE,
    uploadedAt: now,
    updatedAt: now,
    deletedAt: null,
    deletedByMemberId: null,
    deleteReason: null,
    moderationStartedAt: now,
    moderationCompletedAt: now,
    moderationAttemptCount: 1,
    lastModerationError: null,
    latestModerationJobId: null,
    moderationQueuedAt: now,
    ...overrides,
  };
}

function tag(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tag-1',
    mediaId: 'media-1',
    taggedMemberId: 'tagged',
    taggedByMemberId: 'requester',
    tagNote: null,
    createdAt: now,
    taggedMember: selectedMember('tagged'),
    taggedByMember: selectedMember('requester'),
    ...overrides,
  };
}

describe('AlbumTagsService', () => {
  let service: AlbumTagsService;
  let prisma: {
    albumMedia: { findFirst: jest.Mock };
    familyMember: { findFirst: jest.Mock };
    albumMediaTag: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let notifications: { createForMembers: jest.Mock };

  beforeEach(() => {
    prisma = {
      albumMedia: { findFirst: jest.fn() },
      familyMember: { findFirst: jest.fn() },
      albumMediaTag: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(callback(prisma)),
      ),
    };
    notifications = {
      createForMembers: jest.fn().mockResolvedValue({ count: 1 }),
    };
    service = new AlbumTagsService(
      prisma as unknown as PrismaService,
      new AlbumMediaPolicy(),
      notifications as unknown as NotificationsService,
    );
  });

  it('creates a FAMILY SAFE tag and notification in one transaction', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    prisma.familyMember.findFirst.mockResolvedValue(selectedMember('tagged'));
    prisma.albumMediaTag.create.mockResolvedValue(tag());

    const result = await service.add(
      'family-1',
      'media-1',
      member('requester'),
      { taggedMemberId: 'tagged', tagNote: '  note  ' },
    );

    expect(prisma.albumMediaTag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tagNote: 'note' }),
      }),
    );
    expect(notifications.createForMembers).toHaveBeenCalledWith(
      'family-1',
      ['tagged'],
      {
        type: NotificationType.ALBUM_TAG,
        priority: NotificationPriority.NORMAL,
        title: 'Bạn được gắn thẻ trong một nội dung album',
        body: 'requester đã gắn thẻ bạn trong một nội dung album gia đình.',
        referenceType: 'ALBUM_MEDIA',
        referenceId: 'media-1',
      },
      prisma,
    );
    expect(result.taggedMember.memberStatus).toBe(MemberStatus.ACTIVE);
  });

  it('does not notify for self tag and stores empty note as null', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    prisma.familyMember.findFirst.mockResolvedValue(
      selectedMember('requester'),
    );
    prisma.albumMediaTag.create.mockResolvedValue(
      tag({
        taggedMemberId: 'requester',
        taggedMember: selectedMember('requester'),
      }),
    );

    await service.add('family-1', 'media-1', member('requester'), {
      taggedMemberId: 'requester',
      tagNote: '   ',
    });

    expect(
      prisma.albumMediaTag.create.mock.calls[0][0].data.tagNote,
    ).toBeNull();
    expect(notifications.createForMembers).not.toHaveBeenCalled();
  });

  it('allows PRIVATE only for uploader self-tag', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(
      media({ visibilityScope: AlbumVisibilityScope.PRIVATE }),
    );
    prisma.familyMember.findFirst.mockResolvedValue(selectedMember('uploader'));
    prisma.albumMediaTag.create.mockResolvedValue(
      tag({
        taggedMemberId: 'uploader',
        taggedByMemberId: 'uploader',
        taggedMember: selectedMember('uploader'),
        taggedByMember: selectedMember('uploader'),
      }),
    );

    await expect(
      service.add('family-1', 'media-1', member('uploader'), {
        taggedMemberId: 'uploader',
      }),
    ).resolves.toMatchObject({ id: 'tag-1' });

    prisma.familyMember.findFirst.mockResolvedValue(selectedMember('tagged'));
    await expect(
      service.add('family-1', 'media-1', member('uploader'), {
        taggedMemberId: 'tagged',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects MANAGER_ONLY target without media access', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(
      media({ visibilityScope: AlbumVisibilityScope.MANAGER_ONLY }),
    );
    prisma.familyMember.findFirst.mockResolvedValue(selectedMember('normal'));

    await expect(
      service.add(
        'family-1',
        'media-1',
        member('manager', FamilyRole.FAMILY_MANAGER),
        { taggedMemberId: 'normal' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    { moderationStatus: MediaModerationStatus.PENDING },
    { moderationStatus: MediaModerationStatus.PROCESSING },
    { moderationStatus: MediaModerationStatus.NEED_REVIEW },
    { moderationStatus: MediaModerationStatus.FLAGGED },
    { deletedAt: now },
  ])('rejects media that is not taggable: %p', async (override) => {
    prisma.albumMedia.findFirst.mockResolvedValue(media(override));
    await expect(
      service.add('family-1', 'media-1', member('requester'), {
        taggedMemberId: 'tagged',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.albumMediaTag.create).not.toHaveBeenCalled();
  });

  it.each([MemberStatus.INACTIVE, MemberStatus.REMOVED])(
    'rejects a %s tagged member',
    async (status) => {
      prisma.albumMedia.findFirst.mockResolvedValue(media());
      prisma.familyMember.findFirst.mockResolvedValue(
        selectedMember('tagged', FamilyRole.FAMILY_MEMBER, status),
      );
      await expect(
        service.add('family-1', 'media-1', member('requester'), {
          taggedMemberId: 'tagged',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('returns 404 for cross-family media or tagged member', async () => {
    prisma.albumMedia.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.add('family-1', 'media-other', member('requester'), {
        taggedMemberId: 'tagged',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.albumMedia.findFirst).toHaveBeenCalledWith({
      where: { id: 'media-other', workspaceId: 'family-1' },
    });

    prisma.albumMedia.findFirst.mockResolvedValueOnce(media());
    prisma.familyMember.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.add('family-1', 'media-1', member('requester'), {
        taggedMemberId: 'member-other-family',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps duplicate P2002 to Conflict without notification', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    prisma.familyMember.findFirst.mockResolvedValue(selectedMember('tagged'));
    prisma.albumMediaTag.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );

    await expect(
      service.add('family-1', 'media-1', member('requester'), {
        taggedMemberId: 'tagged',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(notifications.createForMembers).not.toHaveBeenCalled();
  });

  it('lists member status and compact remove permission', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    prisma.albumMediaTag.findMany.mockResolvedValue([
      tag({
        taggedMember: selectedMember(
          'tagged',
          FamilyRole.FAMILY_MEMBER,
          MemberStatus.REMOVED,
        ),
      }),
    ]);

    const result = await service.list(
      'family-1',
      'media-1',
      member('requester'),
    );
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      taggedMember: { memberStatus: MemberStatus.REMOVED },
      permissions: { canRemove: true },
    });
    expect(result.items[0].taggedMember).not.toHaveProperty('email');
  });

  it.each([
    ['requester', FamilyRole.FAMILY_MEMBER],
    ['tagged', FamilyRole.FAMILY_MEMBER],
    ['uploader', FamilyRole.FAMILY_MEMBER],
    ['manager', FamilyRole.FAMILY_MANAGER],
    ['deputy', FamilyRole.DEPUTY_MEMBER],
  ] as const)('allows %s to remove the tag', async (id, role) => {
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    prisma.albumMediaTag.findFirst.mockResolvedValue(tag());
    prisma.albumMediaTag.delete.mockResolvedValue(tag());

    await expect(
      service.remove('family-1', 'media-1', 'tag-1', member(id, role)),
    ).resolves.toEqual({ id: 'tag-1', removed: true });
    expect(prisma.albumMediaTag.findFirst).toHaveBeenCalledWith({
      where: { id: 'tag-1', mediaId: 'media-1' },
    });
  });

  it('denies unrelated member from removing the tag', async () => {
    prisma.albumMedia.findFirst.mockResolvedValue(media());
    prisma.albumMediaTag.findFirst.mockResolvedValue(tag());

    await expect(
      service.remove('family-1', 'media-1', 'tag-1', member('unrelated')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.albumMediaTag.delete).not.toHaveBeenCalled();
  });
});
