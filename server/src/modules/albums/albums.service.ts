import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AlbumMediaType,
  AlbumVisibilityScope,
  FamilyMember,
  MediaModerationStatus,
  Prisma,
  StorageCleanupReason,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { UploadedFilePayload } from '../storage/storage.service';
import { AlbumMediaPolicy } from './album-media.policy';
import { AlbumStorageCleanupService } from './album-storage-cleanup.service';
import { AlbumModerationService } from './moderation/album-moderation.service';
import { CloudflareWorkersAiService } from './moderation/cloudflare-workers-ai.service';
import { ModerationProviderError } from './moderation/moderation.types';
import {
  ALBUM_MAX_FILE_SIZE,
  ALBUM_MIME_TO_EXT,
  validateAlbumFile,
} from './album-media.validator';
import {
  AlbumDraftContentIntent,
  AlbumDeletedView,
  AlbumSortOrder,
  AnalyzeAlbumDraftDto,
  ListAlbumMediaQueryDto,
  SoftDeleteAlbumMediaDto,
  UpdateAlbumMediaDto,
  UploadAlbumMediaDto,
} from './dto/album-media.dto';

const albumMediaInclude = {
  collection: {
    select: {
      id: true,
      name: true,
      description: true,
      deletedAt: true,
    },
  },
  uploadedByMember: {
    select: {
      id: true,
      displayName: true,
      familyRole: true,
      user: { select: { fullName: true, avatarUrl: true } },
    },
  },
  _count: { select: { tags: true } },
} satisfies Prisma.AlbumMediaInclude;

type AlbumMediaWithUploader = Prisma.AlbumMediaGetPayload<{
  include: typeof albumMediaInclude;
}>;

@Injectable()
export class AlbumsService {
  private readonly signedUrlTtlSeconds: number;
  private readonly draftAnalysisTimeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly cleanup: AlbumStorageCleanupService,
    private readonly policy: AlbumMediaPolicy,
    private readonly moderation: AlbumModerationService,
    private readonly workersAi: CloudflareWorkersAiService,
    config: ConfigService,
  ) {
    this.signedUrlTtlSeconds = config.get<number>(
      'storage.signedUrlTtlSeconds',
      600,
    );
    this.draftAnalysisTimeoutMs = config.get<number>(
      'albumModeration.draftAnalysisTimeoutMs',
      12000,
    );
  }

  async analyzeDraft(
    workspaceId: string,
    member: FamilyMember,
    dto: AnalyzeAlbumDraftDto,
    file: UploadedFilePayload | undefined,
  ) {
    void member;
    const validated = validateAlbumFile(file);
    const topic = await this.resolveDraftTopic(workspaceId, dto);
    const declaredContentIntent = dto.declaredContentIntent ?? null;
    const expectsPeople =
      declaredContentIntent === AlbumDraftContentIntent.PEOPLE ||
      this.topicSuggestsPeople(topic);
    const base = {
      collectionId: dto.collectionId ?? null,
      topic,
      declaredContentIntent,
      mediaType: validated.mediaType,
    };

    if (validated.mediaType === AlbumMediaType.VIDEO) {
      return {
        ...base,
        recommendation: 'WARN',
        analysisStatus: 'SKIPPED',
        hasPerson: null,
        topicMatch: 'UNKNOWN',
        topicConfidence: 0,
        detectedLabels: [],
        summary: 'Video sẽ được kiểm duyệt sau khi upload.',
        warnings: [
          'Chưa phân tích chủ đề video ở bước nháp. Hệ thống vẫn sẽ kiểm duyệt video sau khi upload.',
        ],
        suggestedActions: ['CONFIRM_UPLOAD', 'CHOOSE_ANOTHER_COLLECTION'],
      };
    }

    try {
      const result = await this.withDraftTimeout(
        this.workersAi.analyzeAlbumContext(
          file!.buffer,
          validated.mimeType,
          topic,
        ),
      );
      const warnings: string[] = [];
      const suggestedActions = new Set<string>(['CONFIRM_UPLOAD']);
      if (expectsPeople && !result.hasPerson) {
        warnings.push(
          'Không phát hiện người trong ảnh. Ảnh vẫn có thể là kỷ niệm gia đình, nhưng sẽ không có gợi ý khuôn mặt nếu hệ thống không tìm thấy khuôn mặt.',
        );
      }
      if (expectsPeople && !result.hasPerson && topic) {
        suggestedActions.add('CHOOSE_ANOTHER_COLLECTION');
      }
      if (topic && result.topicMatch === 'MISMATCH') {
        warnings.push(
          result.mismatchReason ||
            `Ảnh có vẻ không khớp với chủ đề album "${topic}".`,
        );
        suggestedActions.add('CHOOSE_ANOTHER_COLLECTION');
      }

      return {
        ...base,
        recommendation: warnings.length > 0 ? 'WARN' : 'ALLOW',
        analysisStatus: 'COMPLETED',
        hasPerson: result.hasPerson,
        topicMatch:
          result.topicMatch === 'UNCERTAIN' ? 'UNKNOWN' : result.topicMatch,
        topicConfidence: result.topicConfidence,
        detectedLabels: result.labels,
        summary: result.sceneSummary,
        warnings,
        suggestedActions: [...suggestedActions],
      };
    } catch (error) {
      if (!(error instanceof ModerationProviderError)) throw error;
      return {
        ...base,
        recommendation: 'WARN',
        analysisStatus: 'UNAVAILABLE',
        hasPerson: null,
        topicMatch: 'UNKNOWN',
        topicConfidence: 0,
        detectedLabels: [],
        summary: 'Chưa thể phân tích ảnh ở bước nháp.',
        warnings: [
          'Chưa thể phân tích ảnh trước upload. Bạn vẫn có thể upload và hệ thống sẽ kiểm duyệt sau.',
        ],
        suggestedActions: ['CONFIRM_UPLOAD', 'TRY_AGAIN'],
        errorCode: error.code,
      };
    }
  }

  async upload(
    workspaceId: string,
    member: FamilyMember,
    dto: UploadAlbumMediaDto,
    file: UploadedFilePayload | undefined,
  ) {
    const validated = validateAlbumFile(file);
    const collectionId = await this.resolveCollectionId(
      workspaceId,
      dto.collectionId,
    );
    const saved = await this.storage.savePrivateFile(
      'album-media',
      workspaceId,
      file,
      { allowedMimeToExt: ALBUM_MIME_TO_EXT, maxSize: ALBUM_MAX_FILE_SIZE },
    );

    let media: AlbumMediaWithUploader;
    try {
      media = await this.prisma.albumMedia.create({
        data: {
          workspaceId,
          collectionId,
          uploadedByMemberId: member.id,
          mediaType: validated.mediaType,
          mediaUrl: null,
          storageKey: saved.storageKey,
          originalFileName: saved.fileName,
          mimeType: validated.mimeType,
          fileSize: saved.size,
          caption: this.normalizeOptionalText(dto.caption),
          visibilityScope: dto.visibilityScope ?? AlbumVisibilityScope.FAMILY,
          moderationStatus: MediaModerationStatus.PENDING,
        },
        include: albumMediaInclude,
      });
    } catch (error) {
      const deleted = await this.storage.deleteFileByKey(
        saved.storageKey,
        false,
      );
      if (!deleted) {
        await this.cleanup.record(
          workspaceId,
          saved.storageKey,
          StorageCleanupReason.ORPHAN_UPLOAD,
        );
      }
      throw error;
    }

    await this.moderation.enqueueAfterUpload(media);
    return this.detail(workspaceId, media.id, member);
  }

  async list(
    workspaceId: string,
    member: FamilyMember,
    query: ListAlbumMediaQueryDto,
  ) {
    if (query.taggedMemberId) {
      const taggedMember = await this.prisma.familyMember.findFirst({
        where: { id: query.taggedMemberId, familyId: workspaceId },
        select: { id: true },
      });
      if (!taggedMember) {
        throw new NotFoundException('Không tìm thấy thành viên được gắn thẻ');
      }
    }
    if (query.uploaderMemberId) {
      const uploader = await this.prisma.familyMember.findFirst({
        where: { id: query.uploaderMemberId, familyId: workspaceId },
        select: { id: true },
      });
      if (!uploader) {
        throw new NotFoundException('Không tìm thấy thành viên tải lên');
      }
    }

    if (query.collectionId) {
      await this.ensureActiveCollection(workspaceId, query.collectionId);
    }

    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException(
        'Thời gian bắt đầu không được sau kết thúc',
      );
    }

    const filters: Prisma.AlbumMediaWhereInput[] = [
      this.buildReadAccessWhere(member),
      query.deletedView === AlbumDeletedView.TRASH
        ? { deletedAt: { not: null } }
        : { deletedAt: null },
    ];
    if (
      query.deletedView === AlbumDeletedView.TRASH &&
      !this.policy.isManager(member)
    ) {
      filters.push({ uploadedByMemberId: member.id });
    }
    if (query.mediaType) filters.push({ mediaType: query.mediaType });
    if (query.collectionId) filters.push({ collectionId: query.collectionId });
    if (query.uploaderMemberId) {
      filters.push({ uploadedByMemberId: query.uploaderMemberId });
    }
    if (query.taggedMemberId) {
      filters.push({
        tags: { some: { taggedMemberId: query.taggedMemberId } },
      });
    }
    if (query.visibilityScope) {
      filters.push({ visibilityScope: query.visibilityScope });
    }
    if (query.moderationStatus) {
      filters.push({ moderationStatus: query.moderationStatus });
    }
    if (from || to) {
      filters.push({
        uploadedAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      });
    }

    const where: Prisma.AlbumMediaWhereInput = {
      workspaceId,
      AND: filters,
    };
    const direction: 'asc' | 'desc' =
      query.sortOrder === AlbumSortOrder.ASC ? 'asc' : 'desc';
    const skip = (query.page - 1) * query.limit;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.albumMedia.count({ where }),
      this.prisma.albumMedia.findMany({
        where,
        include: albumMediaInclude,
        skip,
        take: query.limit,
        orderBy: [{ uploadedAt: direction }, { id: direction }],
      }),
    ]);

    return {
      items: await Promise.all(
        rows.map((row) => this.mapMedia(row, member, false)),
      ),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async detail(workspaceId: string, mediaId: string, member: FamilyMember) {
    const media = await this.prisma.albumMedia.findFirst({
      where: { id: mediaId, workspaceId, deletedAt: null },
      include: albumMediaInclude,
    });
    if (!media || !this.policy.canViewMetadata(media, member)) {
      throw new NotFoundException('Không tìm thấy media');
    }
    return this.mapMedia(media, member);
  }

  async update(
    workspaceId: string,
    mediaId: string,
    member: FamilyMember,
    dto: UpdateAlbumMediaDto,
  ) {
    const media = await this.getScopedMedia(workspaceId, mediaId);
    if (!this.policy.canEdit(media, member)) {
      throw new ForbiddenException('Chỉ người tải lên mới được sửa media');
    }
    if (media.deletedAt) {
      throw new BadRequestException('Không thể sửa media đã xóa');
    }
    if (
      dto.caption === undefined &&
      dto.visibilityScope === undefined &&
      dto.collectionId === undefined
    ) {
      throw new BadRequestException('Không có nội dung cần cập nhật');
    }

    const collectionId =
      dto.collectionId === undefined
        ? undefined
        : await this.resolveCollectionId(workspaceId, dto.collectionId);

    const updated = await this.prisma.albumMedia.update({
      where: { id: mediaId, workspaceId },
      data: {
        ...(dto.caption !== undefined
          ? { caption: this.normalizeOptionalText(dto.caption) }
          : {}),
        ...(dto.visibilityScope !== undefined
          ? { visibilityScope: dto.visibilityScope }
          : {}),
        ...(dto.collectionId !== undefined ? { collectionId } : {}),
      },
      include: albumMediaInclude,
    });
    return this.mapMedia(updated, member);
  }

  async softDelete(
    workspaceId: string,
    mediaId: string,
    member: FamilyMember,
    dto: SoftDeleteAlbumMediaDto,
  ) {
    const media = await this.getScopedMedia(workspaceId, mediaId);
    if (!this.policy.canSoftDelete(media, member)) {
      throw new ForbiddenException('Bạn không có quyền xóa media này');
    }
    if (media.deletedAt) {
      throw new BadRequestException('Media đã được xóa trước đó');
    }
    const updated = await this.prisma.albumMedia.update({
      where: { id: mediaId, workspaceId },
      data: {
        deletedAt: new Date(),
        deletedByMemberId: member.id,
        deleteReason: this.normalizeOptionalText(dto.reason),
      },
      include: albumMediaInclude,
    });
    return this.mapMedia(updated, member);
  }

  async restore(workspaceId: string, mediaId: string, member: FamilyMember) {
    const media = await this.getScopedMedia(workspaceId, mediaId);
    if (!this.policy.canRestore(media, member)) {
      throw new ForbiddenException('Bạn không có quyền khôi phục media này');
    }
    if (!media.deletedAt) {
      throw new BadRequestException('Media chưa bị xóa');
    }
    const updated = await this.prisma.albumMedia.update({
      where: { id: mediaId, workspaceId },
      data: {
        deletedAt: null,
        deletedByMemberId: null,
        deleteReason: null,
      },
      include: albumMediaInclude,
    });
    return this.mapMedia(updated, member);
  }

  async permanentDelete(
    workspaceId: string,
    mediaId: string,
    member: FamilyMember,
  ) {
    const media = await this.getScopedMedia(workspaceId, mediaId);
    if (!this.policy.canPermanentDelete(media, member)) {
      throw new ForbiddenException(
        'Bạn không có quyền xóa vĩnh viễn media này',
      );
    }
    if (!media.deletedAt) {
      throw new BadRequestException(
        'Cần xóa mềm media trước khi xóa vĩnh viễn',
      );
    }
    if (!media.storageKey) {
      throw new BadRequestException(
        'Media legacy thiếu storageKey nên không thể xóa vĩnh viễn an toàn',
      );
    }

    try {
      await this.storage.deleteFileByKey(media.storageKey, true);
    } catch (error) {
      await this.cleanup.record(
        workspaceId,
        media.storageKey,
        StorageCleanupReason.PERMANENT_DELETE_RETRY,
        mediaId,
      );
      throw error;
    }
    try {
      await this.prisma.albumMedia.delete({
        where: { id: mediaId, workspaceId },
      });
    } catch (error) {
      await this.cleanup.record(
        workspaceId,
        media.storageKey,
        StorageCleanupReason.PERMANENT_DELETE_DB_FAILED,
        mediaId,
      );
      throw error;
    }
    return { id: mediaId, permanentlyDeleted: true };
  }

  private async getScopedMedia(workspaceId: string, mediaId: string) {
    const media = await this.prisma.albumMedia.findFirst({
      where: { id: mediaId, workspaceId },
      include: albumMediaInclude,
    });
    if (!media) throw new NotFoundException('Không tìm thấy media');
    return media;
  }

  private buildReadAccessWhere(
    member: FamilyMember,
  ): Prisma.AlbumMediaWhereInput {
    const safeVisibility = this.policy.isManager(member)
      ? [AlbumVisibilityScope.FAMILY, AlbumVisibilityScope.MANAGER_ONLY]
      : [AlbumVisibilityScope.FAMILY];
    const rules: Prisma.AlbumMediaWhereInput[] = [
      { uploadedByMemberId: member.id },
      {
        moderationStatus: MediaModerationStatus.SAFE,
        visibilityScope: { in: safeVisibility },
      },
    ];
    if (this.policy.isManager(member)) {
      rules.push({
        moderationStatus: {
          in: [
            MediaModerationStatus.PENDING,
            MediaModerationStatus.PROCESSING,
            MediaModerationStatus.NEED_REVIEW,
            MediaModerationStatus.FLAGGED,
          ],
        },
      });
    }
    return { OR: rules };
  }

  private async mapMedia(
    media: AlbumMediaWithUploader,
    member: FamilyMember,
    includeFileAccess = true,
  ) {
    const canViewFile = this.policy.canViewFile(media, member);
    const canEdit = !media.deletedAt && this.policy.canEdit(media, member);
    const canSoftDelete =
      !media.deletedAt && this.policy.canSoftDelete(media, member);
    const canRestore =
      Boolean(media.deletedAt) && this.policy.canRestore(media, member);
    const canPermanentDelete =
      Boolean(media.deletedAt) &&
      Boolean(media.storageKey) &&
      this.policy.canPermanentDelete(media, member);
    const fileAccess =
      includeFileAccess && canViewFile && media.storageKey
        ? {
            url: await this.storage.createSignedReadUrl(
              media.storageKey,
              this.signedUrlTtlSeconds,
            ),
            expiresInSeconds: this.signedUrlTtlSeconds,
          }
        : null;

    return {
      id: media.id,
      mediaType: media.mediaType,
      collection: media.collection
        ? {
            id: media.collection.id,
            name: media.collection.name,
            description: media.collection.description,
          }
        : null,
      collectionId: media.collection?.id ?? null,
      caption: media.caption,
      visibilityScope: media.visibilityScope,
      moderationStatus: media.moderationStatus,
      tagCount: media._count.tags,
      originalFileName: media.originalFileName,
      mimeType: media.mimeType,
      fileSize: media.fileSize,
      uploadedAt: media.uploadedAt,
      updatedAt: media.updatedAt,
      deletedAt: media.deletedAt,
      deleteReason:
        canRestore || canPermanentDelete ? media.deleteReason : undefined,
      uploadedBy: {
        memberId: media.uploadedByMember.id,
        displayName:
          media.uploadedByMember.displayName ??
          media.uploadedByMember.user.fullName ??
          'Thành viên',
        familyRole: media.uploadedByMember.familyRole,
        avatarUrl: media.uploadedByMember.user.avatarUrl,
      },
      fileAccess,
      permissions: {
        canEdit,
        canSoftDelete,
        canRestore,
        canPermanentDelete,
        canTag: this.policy.canCreateTag(media, member, member),
        canReviewModeration:
          !media.deletedAt &&
          this.policy.isManager(member) &&
          (media.moderationStatus === MediaModerationStatus.NEED_REVIEW ||
            media.moderationStatus === MediaModerationStatus.FLAGGED),
      },
    };
  }

  private async resolveCollectionId(
    workspaceId: string,
    collectionId: string | null | undefined,
  ) {
    if (collectionId === undefined) return undefined;
    if (collectionId === null || collectionId.trim() === '') return null;
    await this.ensureActiveCollection(workspaceId, collectionId);
    return collectionId;
  }

  private async ensureActiveCollection(
    workspaceId: string,
    collectionId: string,
  ) {
    const collection = await this.prisma.albumCollection.findFirst({
      where: { id: collectionId, workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (!collection) throw new NotFoundException('Không tìm thấy album');
  }

  private async resolveDraftTopic(
    workspaceId: string,
    dto: AnalyzeAlbumDraftDto,
  ) {
    const explicitTopic = this.normalizeOptionalText(dto.topic);
    if (dto.collectionId) {
      const collection = await this.prisma.albumCollection.findFirst({
        where: { id: dto.collectionId, workspaceId, deletedAt: null },
        select: { name: true },
      });
      if (!collection) throw new NotFoundException('Không tìm thấy album');
      return explicitTopic ?? collection.name;
    }
    return explicitTopic;
  }

  private normalizeOptionalText(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private topicSuggestsPeople(topic: string | null | undefined) {
    const normalized = topic?.trim().replace(/\s+/g, ' ');
    if (!normalized) return false;
    return /\b(anh|chi|em|ong|ba|bo|me|bac|co|chu|di|cau|mo|thay|ban)\b/i.test(
      normalized,
    );
  }

  private withDraftTimeout<T>(promise: Promise<T>): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeout = setTimeout(() => {
        reject(
          new ModerationProviderError(
            'PhÃ¢n tÃ­ch nhÃ¡p album vÆ°á»£t quÃ¡ thá»i gian chá»',
            'AI_DRAFT_TIMEOUT',
            true,
          ),
        );
      }, this.draftAnalysisTimeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timeout) clearTimeout(timeout);
    });
  }
}
