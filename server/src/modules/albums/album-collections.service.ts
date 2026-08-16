import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FamilyMember, MediaModerationStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AlbumMediaPolicy } from './album-media.policy';
import {
  CreateAlbumCollectionDto,
  ListAlbumCollectionsQueryDto,
  UpdateAlbumCollectionDto,
} from './dto/album-collection.dto';

const albumCollectionInclude = {
  createdByMember: {
    select: {
      id: true,
      displayName: true,
      familyRole: true,
      user: { select: { fullName: true, avatarUrl: true } },
    },
  },
  _count: { select: { media: true } },
} satisfies Prisma.AlbumCollectionInclude;

type AlbumCollectionWithRelations = Prisma.AlbumCollectionGetPayload<{
  include: typeof albumCollectionInclude;
}>;

@Injectable()
export class AlbumCollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AlbumMediaPolicy,
  ) {}

  async create(
    workspaceId: string,
    member: FamilyMember,
    dto: CreateAlbumCollectionDto,
  ) {
    const name = this.normalizeRequiredName(dto.name);
    const description = this.normalizeOptionalText(dto.description);
    const coverMediaId = await this.resolveCoverMediaId(
      workspaceId,
      member,
      dto.coverMediaId,
    );

    try {
      const collection = await this.prisma.albumCollection.create({
        data: {
          workspaceId,
          name,
          description,
          coverMediaId,
          createdByMemberId: member.id,
        },
        include: albumCollectionInclude,
      });
      return this.mapCollection(collection, member);
    } catch (error) {
      if (this.isDuplicate(error)) {
        throw new ConflictException('Tên album đã tồn tại trong gia đình');
      }
      throw error;
    }
  }

  async list(
    workspaceId: string,
    member: FamilyMember,
    query: ListAlbumCollectionsQueryDto,
  ) {
    const where: Prisma.AlbumCollectionWhereInput = {
      workspaceId,
      deletedAt: null,
    };
    const skip = (query.page - 1) * query.limit;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.albumCollection.count({ where }),
      this.prisma.albumCollection.findMany({
        where,
        include: albumCollectionInclude,
        skip,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);

    return {
      items: rows.map((row) => this.mapCollection(row, member)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async detail(
    workspaceId: string,
    collectionId: string,
    member: FamilyMember,
  ) {
    const collection = await this.getScopedCollection(
      workspaceId,
      collectionId,
    );
    return this.mapCollection(collection, member);
  }

  async update(
    workspaceId: string,
    collectionId: string,
    member: FamilyMember,
    dto: UpdateAlbumCollectionDto,
  ) {
    const collection = await this.getScopedCollection(
      workspaceId,
      collectionId,
    );
    if (!this.canManageCollection(collection, member)) {
      throw new ForbiddenException('Bạn không có quyền sửa album này');
    }
    if (
      dto.name === undefined &&
      dto.description === undefined &&
      dto.coverMediaId === undefined
    ) {
      throw new BadRequestException('Không có nội dung cần cập nhật');
    }

    const data: Prisma.AlbumCollectionUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = this.normalizeRequiredName(dto.name);
    }
    if (dto.description !== undefined) {
      data.description = this.normalizeOptionalText(dto.description);
    }
    if (dto.coverMediaId !== undefined) {
      const coverMediaId = await this.resolveCoverMediaId(
        workspaceId,
        member,
        dto.coverMediaId,
      );
      data.coverMedia =
        coverMediaId === null
          ? { disconnect: true }
          : { connect: { id: coverMediaId } };
    }

    try {
      const updated = await this.prisma.albumCollection.update({
        where: { id: collectionId, workspaceId },
        data,
        include: albumCollectionInclude,
      });
      return this.mapCollection(updated, member);
    } catch (error) {
      if (this.isDuplicate(error)) {
        throw new ConflictException('Tên album đã tồn tại trong gia đình');
      }
      throw error;
    }
  }

  async softDelete(
    workspaceId: string,
    collectionId: string,
    member: FamilyMember,
  ) {
    const collection = await this.getScopedCollection(
      workspaceId,
      collectionId,
    );
    if (!this.canManageCollection(collection, member)) {
      throw new ForbiddenException('Bạn không có quyền xóa album này');
    }

    const updated = await this.prisma.albumCollection.update({
      where: { id: collectionId, workspaceId },
      data: { deletedAt: new Date() },
      include: albumCollectionInclude,
    });
    return this.mapCollection(updated, member);
  }

  private async getScopedCollection(workspaceId: string, collectionId: string) {
    const collection = await this.prisma.albumCollection.findFirst({
      where: { id: collectionId, workspaceId, deletedAt: null },
      include: albumCollectionInclude,
    });
    if (!collection) throw new NotFoundException('Không tìm thấy album');
    return collection;
  }

  private async resolveCoverMediaId(
    workspaceId: string,
    member: FamilyMember,
    coverMediaId: string | null | undefined,
  ) {
    if (coverMediaId === undefined) return undefined;
    if (coverMediaId === null || coverMediaId.trim() === '') return null;
    const media = await this.prisma.albumMedia.findFirst({
      where: { id: coverMediaId, workspaceId, deletedAt: null },
    });
    if (!media || !this.policy.canViewMetadata(media, member)) {
      throw new NotFoundException('Không tìm thấy ảnh bìa');
    }
    if (media.moderationStatus !== MediaModerationStatus.SAFE) {
      throw new BadRequestException('Ảnh bìa phải là media đã an toàn');
    }
    return media.id;
  }

  private canManageCollection(
    collection: Pick<AlbumCollectionWithRelations, 'createdByMemberId'>,
    member: FamilyMember,
  ) {
    return (
      collection.createdByMemberId === member.id ||
      this.policy.isManager(member)
    );
  }

  private mapCollection(
    collection: AlbumCollectionWithRelations,
    member: FamilyMember,
  ) {
    const canManage = this.canManageCollection(collection, member);
    return {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      coverMediaId: collection.coverMediaId,
      mediaCount: collection._count.media,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
      deletedAt: collection.deletedAt,
      createdBy: {
        memberId: collection.createdByMember.id,
        displayName:
          collection.createdByMember.displayName ??
          collection.createdByMember.user.fullName ??
          'Thành viên',
        familyRole: collection.createdByMember.familyRole,
        avatarUrl: collection.createdByMember.user.avatarUrl,
      },
      permissions: {
        canEdit: !collection.deletedAt && canManage,
        canDelete: !collection.deletedAt && canManage,
      },
    };
  }

  private normalizeRequiredName(value: string) {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized)
      throw new BadRequestException('Tên album không được trống');
    return normalized;
  }

  private normalizeOptionalText(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private isDuplicate(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
