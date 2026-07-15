import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FamilyMember,
  MediaModerationStatus,
  MemberStatus,
  NotificationPriority,
  NotificationType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AlbumMediaPolicy } from './album-media.policy';
import { AddAlbumMediaTagDto } from './dto/album-tags.dto';

const tagMemberSelect = {
  id: true,
  familyId: true,
  displayName: true,
  familyRole: true,
  status: true,
  user: { select: { fullName: true, avatarUrl: true } },
} satisfies Prisma.FamilyMemberSelect;

const albumTagInclude = {
  taggedMember: { select: tagMemberSelect },
  taggedByMember: { select: tagMemberSelect },
} satisfies Prisma.AlbumMediaTagInclude;

type AlbumTagWithMembers = Prisma.AlbumMediaTagGetPayload<{
  include: typeof albumTagInclude;
}>;

@Injectable()
export class AlbumTagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AlbumMediaPolicy,
    private readonly notifications: NotificationsService,
  ) {}

  async add(
    workspaceId: string,
    mediaId: string,
    requester: FamilyMember,
    dto: AddAlbumMediaTagDto,
  ) {
    const media = await this.getScopedMedia(workspaceId, mediaId);
    if (media.deletedAt) {
      throw new BadRequestException('Không thể gắn thẻ media đã xóa');
    }
    if (media.moderationStatus !== MediaModerationStatus.SAFE) {
      throw new BadRequestException(
        'Chỉ có thể gắn thẻ media đã kiểm duyệt an toàn',
      );
    }
    if (!this.policy.canMemberAccessMedia(media, requester)) {
      throw new NotFoundException('Không tìm thấy media');
    }

    const taggedMember = await this.prisma.familyMember.findFirst({
      where: { id: dto.taggedMemberId, familyId: workspaceId },
      select: tagMemberSelect,
    });
    if (!taggedMember) {
      throw new NotFoundException('Không tìm thấy thành viên được gắn thẻ');
    }
    if (taggedMember.status !== MemberStatus.ACTIVE) {
      throw new BadRequestException(
        'Chỉ có thể gắn thẻ thành viên đang hoạt động',
      );
    }
    if (!this.policy.canMemberAccessMedia(media, taggedMember)) {
      throw new ForbiddenException(
        'Thành viên được chọn không có quyền xem media này',
      );
    }
    if (!this.policy.canCreateTag(media, requester, taggedMember)) {
      throw new ForbiddenException('Không thể tạo tag cho media này');
    }

    let notificationIds: string[] = [];
    try {
      const tag = await this.prisma.$transaction(async (tx) => {
        const created = await tx.albumMediaTag.create({
          data: {
            mediaId,
            taggedMemberId: taggedMember.id,
            taggedByMemberId: requester.id,
            tagNote: this.normalizeOptionalText(dto.tagNote),
          },
          include: albumTagInclude,
        });

        if (taggedMember.id !== requester.id) {
          const { ids } = await this.notifications.notify(
            workspaceId,
            [taggedMember.id],
            {
              type: NotificationType.ALBUM_TAG,
              priority: NotificationPriority.NORMAL,
              title: 'Bạn được gắn thẻ trong một nội dung album',
              body: `${this.displayName(created.taggedByMember)} đã gắn thẻ bạn trong một nội dung album gia đình.`,
              referenceType: 'ALBUM_MEDIA',
              referenceId: mediaId,
            },
            { tx },
          );
          notificationIds = ids;
        }

        return created;
      });

      await this.notifications.dispatch(notificationIds);

      return this.mapTag(tag, media, requester);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Thành viên đã được gắn thẻ trong media này',
        );
      }
      throw error;
    }
  }

  async list(workspaceId: string, mediaId: string, requester: FamilyMember) {
    const media = await this.prisma.albumMedia.findFirst({
      where: { id: mediaId, workspaceId, deletedAt: null },
    });
    if (!media || !this.policy.canViewTags(media, requester)) {
      throw new NotFoundException('Không tìm thấy media');
    }

    const tags = await this.prisma.albumMediaTag.findMany({
      where: { mediaId },
      include: albumTagInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return {
      items: tags.map((tag) => this.mapTag(tag, media, requester)),
      total: tags.length,
    };
  }

  async remove(
    workspaceId: string,
    mediaId: string,
    tagId: string,
    requester: FamilyMember,
  ) {
    const media = await this.getScopedMedia(workspaceId, mediaId);
    const tag = await this.prisma.albumMediaTag.findFirst({
      where: { id: tagId, mediaId },
    });
    if (!tag) {
      throw new NotFoundException('Không tìm thấy tag');
    }
    if (!this.policy.canRemoveTag(media, tag, requester)) {
      throw new ForbiddenException('Bạn không có quyền gỡ tag này');
    }

    await this.prisma.albumMediaTag.delete({ where: { id: tagId } });
    return { id: tagId, removed: true };
  }

  private async getScopedMedia(workspaceId: string, mediaId: string) {
    const media = await this.prisma.albumMedia.findFirst({
      where: { id: mediaId, workspaceId },
    });
    if (!media) {
      throw new NotFoundException('Không tìm thấy media');
    }
    return media;
  }

  private mapTag(
    tag: AlbumTagWithMembers,
    media: Parameters<AlbumMediaPolicy['canRemoveTag']>[0],
    requester: FamilyMember,
  ) {
    return {
      id: tag.id,
      tagNote: tag.tagNote,
      createdAt: tag.createdAt,
      taggedMember: {
        memberId: tag.taggedMember.id,
        displayName: this.displayName(tag.taggedMember),
        avatarUrl: tag.taggedMember.user.avatarUrl,
        familyRole: tag.taggedMember.familyRole,
        memberStatus: tag.taggedMember.status,
      },
      taggedBy: {
        memberId: tag.taggedByMember.id,
        displayName: this.displayName(tag.taggedByMember),
      },
      permissions: {
        canRemove: this.policy.canRemoveTag(media, tag, requester),
      },
    };
  }

  private displayName(member: {
    displayName: string | null;
    user: { fullName: string | null };
  }) {
    return member.displayName ?? member.user.fullName ?? 'Thành viên';
  }

  private normalizeOptionalText(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }
}
