import { randomUUID } from 'crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AlbumMedia,
  AlbumMediaType,
  FamilyMember,
  MediaCheckResult,
  MediaCheckType,
  MediaModerationStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import {
  StorageObjectNotFoundError,
  StorageService,
} from '../../storage/storage.service';
import { AlbumMediaPolicy } from '../album-media.policy';
import { validateAlbumFile } from '../album-media.validator';
import { AlbumSortOrder } from '../dto/album-media.dto';
import {
  ListModerationQueueQueryDto,
  ManualModerationDecision,
  ManualModerationReviewDto,
} from '../dto/album-moderation.dto';
import { CloudflareQueueService } from './cloudflare-queue.service';
import { CloudflareWorkersAiService } from './cloudflare-workers-ai.service';
import {
  AiModerationResult,
  AlbumModerationJob,
  MODERATION_JOB_TYPE,
  MODERATION_JOB_VERSION,
  ModerationCategory,
  ModerationProcessResult,
  ModerationProviderError,
  sanitizeModerationError,
} from './moderation.types';
import { VideoFrameService } from './video-frame.service';

const uploaderSelect = {
  id: true,
  displayName: true,
  familyRole: true,
  user: { select: { fullName: true, avatarUrl: true } },
} satisfies Prisma.FamilyMemberSelect;

const reviewMemberSelect = {
  id: true,
  displayName: true,
  familyRole: true,
  user: { select: { fullName: true } },
} satisfies Prisma.FamilyMemberSelect;

const queueInclude = {
  uploadedByMember: { select: uploaderSelect },
  moderationChecks: {
    orderBy: { checkedAt: 'desc' as const },
    take: 1,
    include: { reviewedByMember: { select: reviewMemberSelect } },
  },
} satisfies Prisma.AlbumMediaInclude;

const historyInclude = {
  reviewedByMember: { select: reviewMemberSelect },
} satisfies Prisma.MediaModerationCheckInclude;

const SERIOUS_CATEGORIES = new Set([
  'SEXUAL_EXPLICIT',
  'GRAPHIC_VIOLENCE',
  'SELF_HARM',
  'HATE_EXTREMISM',
]);

@Injectable()
export class AlbumModerationService {
  private readonly logger = new Logger(AlbumModerationService.name);
  private readonly maxAttempts: number;
  private readonly retryDelaySeconds: number;
  private readonly staleProcessingMinutes: number;
  private readonly reviewThreshold: number;
  private readonly flagThreshold: number;
  private readonly signedUrlTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly queue: CloudflareQueueService,
    private readonly workersAi: CloudflareWorkersAiService,
    private readonly videoFrames: VideoFrameService,
    private readonly policy: AlbumMediaPolicy,
    config: ConfigService,
  ) {
    this.maxAttempts = Math.max(
      1,
      config.get<number>('albumModeration.maxAttempts', 3),
    );
    this.retryDelaySeconds = Math.max(
      1,
      config.get<number>('albumModeration.retryDelaySeconds', 60),
    );
    this.staleProcessingMinutes = Math.max(
      1,
      config.get<number>('albumModeration.staleProcessingMinutes', 10),
    );
    this.reviewThreshold = config.get<number>(
      'albumModeration.reviewThreshold',
      0.45,
    );
    this.flagThreshold = config.get<number>(
      'albumModeration.flagThreshold',
      0.8,
    );
    this.signedUrlTtlSeconds = config.get<number>(
      'storage.signedUrlTtlSeconds',
      600,
    );
  }

  async enqueueAfterUpload(media: AlbumMedia): Promise<void> {
    try {
      await this.createAndPushJob(media, false);
    } catch (error) {
      this.logger.warn(
        `Không thể enqueue moderation job cho media ${media.id}: ${sanitizeModerationError(error)}`,
      );
    }
  }

  async processJob(job: AlbumModerationJob): Promise<ModerationProcessResult> {
    const media = await this.prisma.albumMedia.findFirst({
      where: { id: job.mediaId, workspaceId: job.workspaceId },
    });
    if (
      !media ||
      media.deletedAt ||
      !media.storageKey ||
      media.storageKey !== job.storageKey ||
      media.mediaType !== job.mediaType ||
      media.latestModerationJobId !== job.jobId
    ) {
      return { action: 'ACK' };
    }
    const duplicate = await this.prisma.mediaModerationCheck.findUnique({
      where: { jobId: job.jobId },
      select: { id: true },
    });
    if (duplicate) return { action: 'ACK' };

    const staleBefore = new Date(
      Date.now() - this.staleProcessingMinutes * 60 * 1000,
    );
    const claimed = await this.prisma.albumMedia.updateMany({
      where: {
        id: job.mediaId,
        workspaceId: job.workspaceId,
        latestModerationJobId: job.jobId,
        deletedAt: null,
        OR: [
          { moderationStatus: MediaModerationStatus.PENDING },
          {
            moderationStatus: MediaModerationStatus.PROCESSING,
            moderationStartedAt: { lt: staleBefore },
          },
        ],
      },
      data: {
        moderationStatus: MediaModerationStatus.PROCESSING,
        moderationStartedAt: new Date(),
        moderationAttemptCount: { increment: 1 },
        lastModerationError: null,
      },
    });
    if (claimed.count === 0) {
      return { action: 'RETRY', retryDelaySeconds: 15 };
    }

    const attempt = media.moderationAttemptCount + 1;
    try {
      const result = await this.moderateStoredMedia(media);
      await this.completeJob(media, job, result);
      return { action: 'ACK' };
    } catch (error) {
      if (!this.isHandledProcessingError(error)) throw error;
      const message = sanitizeModerationError(error);
      const transient = this.isTransient(error);
      if (transient && attempt < this.maxAttempts) {
        await this.prisma.albumMedia.updateMany({
          where: {
            id: media.id,
            workspaceId: media.workspaceId,
            latestModerationJobId: job.jobId,
            deletedAt: null,
          },
          data: {
            moderationStatus: MediaModerationStatus.PENDING,
            moderationStartedAt: null,
            lastModerationError: message,
          },
        });
        return {
          action: 'RETRY',
          retryDelaySeconds: this.retryDelaySeconds,
        };
      }
      await this.completeAsNeedReview(media, job, error, message);
      return { action: 'ACK' };
    }
  }

  parseJob(raw: unknown): AlbumModerationJob | null {
    let value = raw;
    if (typeof raw === 'string') {
      try {
        value = JSON.parse(raw);
      } catch {
        return null;
      }
    }
    if (!this.isRecord(value)) return null;
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (
      value.version !== MODERATION_JOB_VERSION ||
      value.type !== MODERATION_JOB_TYPE ||
      typeof value.jobId !== 'string' ||
      !uuid.test(value.jobId) ||
      typeof value.mediaId !== 'string' ||
      !uuid.test(value.mediaId) ||
      typeof value.workspaceId !== 'string' ||
      !uuid.test(value.workspaceId) ||
      typeof value.storageKey !== 'string' ||
      !value.storageKey.startsWith(`album-media/${value.workspaceId}/`) ||
      !Object.values(AlbumMediaType).includes(
        value.mediaType as AlbumMediaType,
      ) ||
      typeof value.requestedAt !== 'string' ||
      Number.isNaN(Date.parse(value.requestedAt))
    ) {
      return null;
    }
    return value as unknown as AlbumModerationJob;
  }

  async listQueue(
    workspaceId: string,
    member: FamilyMember,
    query: ListModerationQueueQueryDto,
  ) {
    this.assertManager(member);
    if (query.uploaderMemberId) {
      const uploader = await this.prisma.familyMember.findFirst({
        where: { id: query.uploaderMemberId, familyId: workspaceId },
        select: { id: true },
      });
      if (!uploader) {
        throw new NotFoundException('Không tìm thấy thành viên tải lên');
      }
    }
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException(
        'Thời gian bắt đầu không được sau kết thúc',
      );
    }
    const statuses = query.moderationStatus
      ? [query.moderationStatus]
      : [
          MediaModerationStatus.PENDING,
          MediaModerationStatus.PROCESSING,
          MediaModerationStatus.NEED_REVIEW,
          MediaModerationStatus.FLAGGED,
        ];
    const where: Prisma.AlbumMediaWhereInput = {
      workspaceId,
      deletedAt: null,
      moderationStatus: { in: statuses },
      ...(query.mediaType ? { mediaType: query.mediaType } : {}),
      ...(query.uploaderMemberId
        ? { uploadedByMemberId: query.uploaderMemberId }
        : {}),
      ...(from || to
        ? {
            uploadedAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };
    const direction =
      query.sortOrder === AlbumSortOrder.ASC
        ? ('asc' as const)
        : ('desc' as const);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.albumMedia.count({ where }),
      this.prisma.albumMedia.findMany({
        where,
        include: queueInclude,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ uploadedAt: direction }, { id: direction }],
      }),
    ]);
    return {
      items: await Promise.all(
        rows.map(async (media) => ({
          id: media.id,
          mediaType: media.mediaType,
          caption: media.caption,
          moderationStatus: media.moderationStatus,
          uploadedAt: media.uploadedAt,
          moderationQueuedAt: media.moderationQueuedAt,
          moderationStartedAt: media.moderationStartedAt,
          moderationCompletedAt: media.moderationCompletedAt,
          moderationAttemptCount: media.moderationAttemptCount,
          lastModerationError: media.lastModerationError,
          uploadedBy: this.mapMember(media.uploadedByMember),
          latestModeration: media.moderationChecks[0]
            ? this.mapManagerCheck(media.moderationChecks[0])
            : null,
          fileAccess:
            media.storageKey && this.policy.canViewFile(media, member)
              ? {
                  url: await this.storage.createSignedReadUrl(
                    media.storageKey,
                    this.signedUrlTtlSeconds,
                  ),
                  expiresInSeconds: this.signedUrlTtlSeconds,
                }
              : null,
          permissions: {
            canReview: true,
            canRetry: this.canRetry(media),
          },
        })),
      ),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async history(workspaceId: string, mediaId: string, member: FamilyMember) {
    const media = await this.prisma.albumMedia.findFirst({
      where: { id: mediaId, workspaceId },
      select: {
        id: true,
        uploadedByMemberId: true,
        moderationStatus: true,
      },
    });
    if (!media) throw new NotFoundException('Không tìm thấy media');
    const isManager = this.policy.isManager(member);
    if (!isManager && media.uploadedByMemberId !== member.id) {
      throw new NotFoundException('Không tìm thấy media');
    }
    const checks = await this.prisma.mediaModerationCheck.findMany({
      where: { mediaId },
      include: historyInclude,
      orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }],
    });
    return {
      mediaId,
      moderationStatus: media.moderationStatus,
      items: checks.map((check) =>
        isManager
          ? this.mapManagerCheck(check)
          : {
              resultStatus: check.resultStatus,
              summary: check.summary,
              reasonCode: check.reasonCode,
              checkedAt: check.checkedAt,
              manualReview: check.reviewedAt
                ? {
                    resultStatus: check.resultStatus,
                    reviewNote: check.reviewNote,
                    reviewedAt: check.reviewedAt,
                  }
                : null,
            },
      ),
    };
  }

  async manualReview(
    workspaceId: string,
    mediaId: string,
    member: FamilyMember,
    dto: ManualModerationReviewDto,
  ) {
    this.assertManager(member);
    const media = await this.prisma.albumMedia.findFirst({
      where: { id: mediaId, workspaceId },
    });
    if (!media) throw new NotFoundException('Không tìm thấy media');
    if (media.deletedAt) {
      throw new BadRequestException('Không thể review media đã xóa');
    }
    if (
      media.moderationStatus !== MediaModerationStatus.NEED_REVIEW &&
      media.moderationStatus !== MediaModerationStatus.FLAGGED
    ) {
      throw new BadRequestException(
        'Media chưa ở trạng thái cần review thủ công',
      );
    }
    const resultStatus =
      dto.decision === ManualModerationDecision.MARK_SAFE
        ? MediaCheckResult.SAFE
        : MediaCheckResult.FLAGGED;
    const status =
      resultStatus === MediaCheckResult.SAFE
        ? MediaModerationStatus.SAFE
        : MediaModerationStatus.FLAGGED;
    const reviewedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.albumMedia.updateMany({
        where: {
          id: mediaId,
          workspaceId,
          deletedAt: null,
          moderationStatus: media.moderationStatus,
        },
        data: {
          moderationStatus: status,
          moderationCompletedAt: reviewedAt,
          moderationStartedAt: null,
          latestModerationJobId: null,
          lastModerationError: null,
        },
      });
      if (updated.count !== 1) {
        throw new BadRequestException('Media không còn đủ điều kiện review');
      }
      await tx.mediaModerationCheck.create({
        data: {
          mediaId,
          checkType: MediaCheckType.SENSITIVE_CONTENT,
          provider: 'MANUAL_REVIEW',
          resultStatus,
          reasonCode: dto.decision,
          summary: 'Kết quả kiểm duyệt thủ công của quản lý gia đình',
          reviewedByMemberId: member.id,
          reviewNote: dto.reviewNote.trim(),
          reviewedAt,
          checkedAt: reviewedAt,
        },
      });
    });
    return { mediaId, moderationStatus: status, reviewedAt };
  }

  async retry(workspaceId: string, mediaId: string, member: FamilyMember) {
    this.assertManager(member);
    const media = await this.prisma.albumMedia.findFirst({
      where: { id: mediaId, workspaceId },
    });
    if (!media) throw new NotFoundException('Không tìm thấy media');
    if (media.deletedAt) {
      throw new BadRequestException('Không thể retry media đã xóa');
    }
    if (!media.storageKey) {
      throw new BadRequestException('Media legacy thiếu storageKey');
    }
    if (!this.canRetry(media)) {
      throw new BadRequestException('Media chưa đủ điều kiện retry moderation');
    }
    return this.createAndPushJob(media, true);
  }

  async recoverStaleJobs(batchSize = 20): Promise<number> {
    const staleBefore = new Date(
      Date.now() - this.staleProcessingMinutes * 60 * 1000,
    );
    const mediaItems = await this.prisma.albumMedia.findMany({
      where: {
        deletedAt: null,
        storageKey: { not: null },
        OR: [
          {
            moderationStatus: MediaModerationStatus.PENDING,
            OR: [
              { moderationQueuedAt: null },
              { moderationQueuedAt: { lt: staleBefore } },
            ],
          },
          {
            moderationStatus: MediaModerationStatus.PROCESSING,
            OR: [
              { moderationStartedAt: null },
              { moderationStartedAt: { lt: staleBefore } },
            ],
          },
        ],
      },
      orderBy: { uploadedAt: 'asc' },
      take: Math.min(100, Math.max(1, batchSize)),
    });
    let recovered = 0;
    for (const media of mediaItems) {
      const result = await this.createAndPushJob(media, false);
      if (result) recovered += 1;
    }
    return recovered;
  }

  async completePoisonedJob(
    job: AlbumModerationJob,
    error: unknown,
  ): Promise<void> {
    const media = await this.prisma.albumMedia.findFirst({
      where: {
        id: job.mediaId,
        workspaceId: job.workspaceId,
        latestModerationJobId: job.jobId,
        deletedAt: null,
      },
    });
    if (!media) return;
    const duplicate = await this.prisma.mediaModerationCheck.findUnique({
      where: { jobId: job.jobId },
      select: { id: true },
    });
    if (duplicate) return;
    await this.completeAsNeedReview(
      media,
      job,
      error,
      sanitizeModerationError(error),
    );
  }

  private async createAndPushJob(media: AlbumMedia, throwOnPushError: boolean) {
    if (
      media.deletedAt ||
      !media.storageKey ||
      !media.storageKey.startsWith(`album-media/${media.workspaceId}/`)
    ) {
      if (throwOnPushError) {
        throw new BadRequestException('Media không đủ điều kiện enqueue');
      }
      return null;
    }
    const jobId = randomUUID();
    const queuedAt = new Date();
    const job: AlbumModerationJob = {
      version: MODERATION_JOB_VERSION,
      type: MODERATION_JOB_TYPE,
      jobId,
      mediaId: media.id,
      workspaceId: media.workspaceId,
      storageKey: media.storageKey,
      mediaType: media.mediaType,
      requestedAt: queuedAt.toISOString(),
    };
    const updated = await this.prisma.albumMedia.updateMany({
      where: {
        id: media.id,
        workspaceId: media.workspaceId,
        deletedAt: null,
      },
      data: {
        moderationStatus: MediaModerationStatus.PENDING,
        latestModerationJobId: jobId,
        moderationQueuedAt: queuedAt,
        moderationStartedAt: null,
        moderationCompletedAt: null,
        lastModerationError: null,
      },
    });
    if (updated.count !== 1) {
      if (throwOnPushError) {
        throw new BadRequestException('Media không còn đủ điều kiện enqueue');
      }
      return null;
    }
    try {
      await this.queue.pushModerationJob(job);
      return { jobId, moderationStatus: MediaModerationStatus.PENDING };
    } catch (error) {
      const message = sanitizeModerationError(error);
      await this.prisma.albumMedia.updateMany({
        where: {
          id: media.id,
          workspaceId: media.workspaceId,
          latestModerationJobId: jobId,
          deletedAt: null,
        },
        data: { lastModerationError: message },
      });
      this.logger.warn(
        `Push moderation job ${jobId} thất bại cho media ${media.id}: ${message}`,
      );
      if (throwOnPushError) {
        throw new ServiceUnavailableException(
          'Không thể đưa media vào hàng đợi moderation, vui lòng retry',
        );
      }
      return { jobId, moderationStatus: MediaModerationStatus.PENDING };
    }
  }

  private async moderateStoredMedia(media: AlbumMedia) {
    if (!media.storageKey || !media.mimeType) {
      throw new ModerationProviderError(
        'Media thiếu metadata private storage',
        'MEDIA_STORAGE_METADATA_MISSING',
        false,
      );
    }
    const object = await this.storage.downloadFileByKey(media.storageKey);
    if (object.contentType && object.contentType !== media.mimeType) {
      throw new ModerationProviderError(
        'Content-Type R2 không khớp metadata media',
        'R2_CONTENT_TYPE_MISMATCH',
        false,
      );
    }
    const validation = validateAlbumFile({
      originalname: media.originalFileName ?? 'media',
      mimetype: media.mimeType,
      size: object.buffer.length,
      buffer: object.buffer,
    });
    if (validation.mediaType !== media.mediaType) {
      throw new ModerationProviderError(
        'Loại media không khớp nội dung object',
        'MEDIA_TYPE_MISMATCH',
        false,
      );
    }
    if (media.mediaType === AlbumMediaType.PHOTO) {
      return this.evaluate(
        await this.workersAi.moderateImage(object.buffer, media.mimeType),
      );
    }
    const frames = await this.videoFrames.extractFrames(object.buffer);
    if (frames.length === 0) {
      throw new ModerationProviderError(
        'Không trích được frame video',
        'VIDEO_NO_FRAMES',
        false,
      );
    }
    const results: AiModerationResult[] = [];
    for (const frame of frames) {
      results.push(
        this.evaluate(await this.workersAi.moderateImage(frame, 'image/jpeg')),
      );
    }
    return this.aggregateVideoResults(results);
  }

  private evaluate(result: AiModerationResult): AiModerationResult {
    const maxScore = Math.max(
      result.riskScore,
      ...result.categories.map((category) => category.score),
    );
    const seriousFlag = result.categories.some(
      (category) =>
        SERIOUS_CATEGORIES.has(category.code) &&
        category.score >= this.flagThreshold,
    );
    let decision = result.decision;
    if (decision === MediaCheckResult.FLAGGED || seriousFlag) {
      decision = MediaCheckResult.FLAGGED;
    } else if (
      decision === MediaCheckResult.NEED_REVIEW ||
      maxScore >= this.reviewThreshold
    ) {
      decision = MediaCheckResult.NEED_REVIEW;
    } else {
      decision = MediaCheckResult.SAFE;
    }
    return { ...result, decision, riskScore: maxScore };
  }

  private aggregateVideoResults(
    results: AiModerationResult[],
  ): AiModerationResult {
    const highest = [...results].sort((a, b) => b.riskScore - a.riskScore)[0];
    const categoryScores = new Map<string, number>();
    for (const result of results) {
      for (const category of result.categories) {
        categoryScores.set(
          category.code,
          Math.max(categoryScores.get(category.code) ?? 0, category.score),
        );
      }
    }
    const categories: ModerationCategory[] = [...categoryScores].map(
      ([code, score]) => ({ code: code as ModerationCategory['code'], score }),
    );
    const decision = results.some(
      (result) => result.decision === MediaCheckResult.FLAGGED,
    )
      ? MediaCheckResult.FLAGGED
      : results.some(
            (result) => result.decision === MediaCheckResult.NEED_REVIEW,
          )
        ? MediaCheckResult.NEED_REVIEW
        : MediaCheckResult.SAFE;
    return {
      decision,
      riskScore: highest.riskScore,
      categories,
      reasonCode: `VIDEO_${decision}`,
      summary: highest.summary,
    };
  }

  private async completeJob(
    media: AlbumMedia,
    job: AlbumModerationJob,
    result: AiModerationResult,
  ) {
    const completedAt = new Date();
    const status = result.decision as unknown as MediaModerationStatus;
    await this.prisma.$transaction(async (tx) => {
      await tx.mediaModerationCheck.create({
        data: {
          mediaId: media.id,
          jobId: job.jobId,
          checkType: MediaCheckType.SENSITIVE_CONTENT,
          provider: 'CLOUDFLARE_WORKERS_AI',
          modelName: this.workersAi.modelName,
          resultStatus: result.decision,
          confidenceScore: result.riskScore,
          categories: result.categories as unknown as Prisma.InputJsonValue,
          reasonCode: result.reasonCode,
          summary: result.summary,
          checkedAt: completedAt,
        },
      });
      const updated = await tx.albumMedia.updateMany({
        where: {
          id: media.id,
          workspaceId: media.workspaceId,
          latestModerationJobId: job.jobId,
          deletedAt: null,
        },
        data: {
          moderationStatus: status,
          moderationCompletedAt: completedAt,
          lastModerationError: null,
        },
      });
      if (updated.count !== 1)
        throw new Error('Moderation job không còn hợp lệ');
    });
  }

  private async completeAsNeedReview(
    media: AlbumMedia,
    job: AlbumModerationJob,
    error: unknown,
    message: string,
  ) {
    const completedAt = new Date();
    const code =
      error instanceof ModerationProviderError
        ? error.code
        : error instanceof StorageObjectNotFoundError
          ? 'R2_OBJECT_NOT_FOUND'
          : 'MODERATION_INPUT_INVALID';
    await this.prisma.$transaction(async (tx) => {
      await tx.mediaModerationCheck.create({
        data: {
          mediaId: media.id,
          jobId: job.jobId,
          checkType: MediaCheckType.SENSITIVE_CONTENT,
          provider: 'CLOUDFLARE_WORKERS_AI',
          modelName: this.workersAi.modelName,
          resultStatus: MediaCheckResult.NEED_REVIEW,
          reasonCode: code,
          summary:
            'Cần quản lý kiểm tra thủ công do xử lý tự động không hoàn tất',
          errorCode: code,
          errorMessage: message,
          checkedAt: completedAt,
        },
      });
      const updated = await tx.albumMedia.updateMany({
        where: {
          id: media.id,
          workspaceId: media.workspaceId,
          latestModerationJobId: job.jobId,
          deletedAt: null,
        },
        data: {
          moderationStatus: MediaModerationStatus.NEED_REVIEW,
          moderationCompletedAt: completedAt,
          lastModerationError: message,
        },
      });
      if (updated.count !== 1) {
        throw new Error('Moderation job không còn hợp lệ');
      }
    });
  }

  private isHandledProcessingError(error: unknown) {
    return (
      error instanceof ModerationProviderError ||
      error instanceof StorageObjectNotFoundError ||
      error instanceof BadRequestException ||
      error instanceof ServiceUnavailableException
    );
  }

  private isTransient(error: unknown) {
    return (
      (error instanceof ModerationProviderError && error.transient) ||
      error instanceof ServiceUnavailableException
    );
  }

  private canRetry(
    media: Pick<AlbumMedia, 'moderationStatus' | 'moderationStartedAt'>,
  ) {
    if (media.moderationStatus === MediaModerationStatus.SAFE) return false;
    if (media.moderationStatus !== MediaModerationStatus.PROCESSING)
      return true;
    if (!media.moderationStartedAt) return true;
    return (
      media.moderationStartedAt.getTime() <
      Date.now() - this.staleProcessingMinutes * 60 * 1000
    );
  }

  private assertManager(member: FamilyMember) {
    if (!this.policy.isManager(member)) {
      throw new ForbiddenException('Chỉ Manager hoặc Deputy được moderation');
    }
  }

  private mapMember(member: {
    id: string;
    displayName: string | null;
    familyRole: string;
    user: { fullName: string | null; avatarUrl?: string | null };
  }) {
    return {
      memberId: member.id,
      displayName: member.displayName ?? member.user.fullName ?? 'Thành viên',
      familyRole: member.familyRole,
      avatarUrl: member.user.avatarUrl ?? null,
    };
  }

  private mapManagerCheck(check: {
    resultStatus: MediaCheckResult;
    provider: string | null;
    modelName: string | null;
    confidenceScore: Prisma.Decimal | null;
    categories: Prisma.JsonValue | null;
    reasonCode: string | null;
    summary: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    reviewNote: string | null;
    reviewedAt: Date | null;
    checkedAt: Date;
    reviewedByMember?: {
      id: string;
      displayName: string | null;
      familyRole: string;
      user: { fullName: string | null };
    } | null;
  }) {
    return {
      resultStatus: check.resultStatus,
      provider: check.provider,
      modelName: check.modelName,
      riskScore: check.confidenceScore?.toNumber() ?? null,
      categories: check.categories,
      reasonCode: check.reasonCode,
      summary: check.summary,
      errorCode: check.errorCode,
      errorMessage: check.errorMessage,
      reviewNote: check.reviewNote,
      reviewedAt: check.reviewedAt,
      reviewedBy: check.reviewedByMember
        ? this.mapMember(check.reviewedByMember)
        : null,
      checkedAt: check.checkedAt,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
