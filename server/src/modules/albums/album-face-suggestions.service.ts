import { randomUUID } from 'crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AlbumFaceDetectionStatus,
  AlbumMedia,
  AlbumMediaType,
  AlbumTagSuggestionStatus,
  FaceProfileStatus,
  FaceScanJob,
  FaceScanJobStatus,
  FamilyMember,
  MediaModerationStatus,
  MemberStatus,
  NotificationPriority,
  NotificationType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  StorageObjectNotFoundError,
  StorageService,
} from '../storage/storage.service';
import { AlbumMediaPolicy } from './album-media.policy';
import { validateAlbumFile } from './album-media.validator';
import { RequestFaceScanDto } from './dto/album-face-suggestions.dto';
import {
  FaceAiClientService,
  FaceDetectionResult,
} from './face-ai-client.service';
import { FaceEmbeddingCryptoService } from './face-embedding-crypto.service';
import { CloudflareQueueService } from './moderation/cloudflare-queue.service';
import {
  AlbumFaceScanQueueJob,
  FACE_SCAN_JOB_TYPE,
  FACE_SCAN_JOB_VERSION,
  ModerationProcessResult,
  sanitizeModerationError,
} from './moderation/moderation.types';

const suggestionMemberSelect = {
  id: true,
  familyId: true,
  displayName: true,
  familyRole: true,
  status: true,
  user: { select: { fullName: true, avatarUrl: true } },
} satisfies Prisma.FamilyMemberSelect;

const suggestionInclude = {
  suggestedMember: { select: suggestionMemberSelect },
  detection: true,
} satisfies Prisma.AlbumTagSuggestionInclude;

const faceDetectionInclude = {
  suggestions: {
    include: { suggestedMember: { select: suggestionMemberSelect } },
    orderBy: [{ createdAt: 'desc' }, { suggestionId: 'desc' }],
  },
} satisfies Prisma.AlbumFaceDetectionInclude;

type SuggestionWithDetection = Prisma.AlbumTagSuggestionGetPayload<{
  include: typeof suggestionInclude;
}>;

type DetectionWithSuggestions = Prisma.AlbumFaceDetectionGetPayload<{
  include: typeof faceDetectionInclude;
}>;

type ScannableMedia = Pick<
  AlbumMedia,
  | 'id'
  | 'workspaceId'
  | 'uploadedByMemberId'
  | 'mediaType'
  | 'storageKey'
  | 'originalFileName'
  | 'mimeType'
  | 'fileSize'
  | 'visibilityScope'
  | 'moderationStatus'
  | 'deletedAt'
>;

interface MatchCandidate {
  member: Pick<
    FamilyMember,
    'id' | 'familyId' | 'familyRole' | 'status' | 'displayName'
  >;
  centroid: number[];
}

interface FaceMatch {
  memberId: string;
  top1Score: number;
  top2Score: number | null;
  margin: number | null;
}

const FACE_SCAN_FORCE_RESCAN_RATE_LIMITED =
  'FACE_SCAN_FORCE_RESCAN_RATE_LIMITED';
const FACE_SCAN_JOB_NOT_RETRYABLE = 'FACE_SCAN_JOB_NOT_RETRYABLE';
const FACE_SCAN_FEATURE = 'ALBUM_FACE_SCAN';

@Injectable()
export class AlbumFaceSuggestionsService {
  private readonly logger = new Logger(AlbumFaceSuggestionsService.name);
  private readonly minSimilarity: number;
  private readonly singleCandidateMinSimilarity: number;
  private readonly minMargin: number;
  private readonly maxAttempts: number;
  private readonly staleMinutes: number;
  private readonly retryDelaySeconds: number;
  private readonly forceRescanLimit: number;
  private readonly forceRescanCooldownSeconds: number;
  private readonly forceScanHits = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AlbumMediaPolicy,
    private readonly queue: CloudflareQueueService,
    private readonly storage: StorageService,
    private readonly faceAi: FaceAiClientService,
    private readonly crypto: FaceEmbeddingCryptoService,
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    this.minSimilarity = config.get<number>('faceScan.minSimilarity', 0.55);
    this.singleCandidateMinSimilarity = config.get<number>(
      'faceScan.singleCandidateMinSimilarity',
      0.75,
    );
    this.minMargin = config.get<number>('faceScan.minMargin', 0.08);
    this.maxAttempts = Math.max(
      1,
      config.get<number>('faceScan.maxAttempts', 3),
    );
    this.staleMinutes = Math.max(
      1,
      config.get<number>('faceScan.staleMinutes', 10),
    );
    this.retryDelaySeconds = Math.max(
      1,
      config.get<number>('faceScan.retryDelaySeconds', 60),
    );
    this.forceRescanLimit = Math.max(
      1,
      config.get<number>('faceScan.forceRescanLimit', 2),
    );
    this.forceRescanCooldownSeconds = Math.max(
      1,
      config.get<number>('faceScan.forceRescanCooldownSeconds', 600),
    );
  }

  async requestScan(
    workspaceId: string,
    mediaId: string,
    requester: FamilyMember,
    dto: RequestFaceScanDto,
  ) {
    const media = await this.getVisibleMedia(workspaceId, mediaId, requester);
    this.assertScannableMedia(media);
    const force = dto.force === true;
    if (force && !this.canForceScan(media, requester)) {
      throw new ForbiddenException('Bạn không có quyền quét lại media này');
    }
    if (force) this.assertForceScanRateLimit(requester.id);

    const activeJob = await this.prisma.faceScanJob.findFirst({
      where: {
        workspaceId,
        mediaId,
        status: {
          in: [FaceScanJobStatus.PENDING, FaceScanJobStatus.PROCESSING],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (activeJob) return this.mapJobSummary(activeJob);

    if (!force) {
      const completedJob = await this.prisma.faceScanJob.findFirst({
        where: { workspaceId, mediaId, status: FaceScanJobStatus.COMPLETED },
        orderBy: { completedAt: 'desc' },
      });
      if (completedJob) return this.mapJobSummary(completedJob);
    }

    const now = new Date();
    const job = await this.prisma.faceScanJob.create({
      data: {
        scanJobId: randomUUID(),
        workspaceId,
        mediaId,
        requestedByMemberId: requester.id,
        status: FaceScanJobStatus.PENDING,
        createdAt: now,
      },
    });
    try {
      await this.queue.pushFaceScanJob({
        version: FACE_SCAN_JOB_VERSION,
        type: FACE_SCAN_JOB_TYPE,
        scanJobId: job.scanJobId,
        mediaId,
        workspaceId,
        requestedAt: now.toISOString(),
      });
      return this.mapJobSummary(job);
    } catch (error) {
      const message = sanitizeModerationError(error);
      await this.prisma.faceScanJob.update({
        where: { scanJobId: job.scanJobId },
        data: {
          status: FaceScanJobStatus.FAILED,
          lastError: message,
          completedAt: new Date(),
        },
      });
      throw new ServiceUnavailableException(
        'Không thể đưa face scan vào hàng đợi, vui lòng thử lại',
      );
    }
  }

  async retryScan(
    workspaceId: string,
    mediaId: string,
    requester: FamilyMember,
  ) {
    const media = await this.getVisibleMedia(workspaceId, mediaId, requester);
    this.assertScannableMedia(media);
    if (!this.canForceScan(media, requester)) {
      throw new ForbiddenException('Ban khong co quyen retry face scan nay');
    }

    const job = await this.prisma.faceScanJob.findFirst({
      where: { workspaceId, mediaId },
      orderBy: { createdAt: 'desc' },
    });
    if (!job) {
      throw new BadRequestException('Media chua co face scan job de retry');
    }

    const isFailed = job.status === FaceScanJobStatus.FAILED;
    const isStaleActive =
      (job.status === FaceScanJobStatus.PENDING ||
        job.status === FaceScanJobStatus.PROCESSING) &&
      this.isJobStale(job);
    if (!isFailed && !isStaleActive) {
      throw new HttpException(
        {
          message: 'Face scan job hien tai chua du dieu kien retry',
          code: FACE_SCAN_JOB_NOT_RETRYABLE,
          errorCode: FACE_SCAN_JOB_NOT_RETRYABLE,
          feature: FACE_SCAN_FEATURE,
          errors: {
            status: job.status,
            maxProcessingSeconds: this.maxProcessingSeconds(),
            staleAt: this.staleAt(job),
          },
        },
        HttpStatus.CONFLICT,
      );
    }

    const queuedAt = new Date();
    const queued = await this.prisma.faceScanJob.update({
      where: { scanJobId: job.scanJobId },
      data: {
        status: FaceScanJobStatus.PENDING,
        startedAt: null,
        completedAt: null,
        lastError: null,
        updatedAt: queuedAt,
      },
    });
    try {
      await this.queue.pushFaceScanJob({
        version: FACE_SCAN_JOB_VERSION,
        type: FACE_SCAN_JOB_TYPE,
        scanJobId: queued.scanJobId,
        mediaId,
        workspaceId,
        requestedAt: queuedAt.toISOString(),
      });
      return this.mapJobSummary(queued);
    } catch (error) {
      const message = sanitizeModerationError(error);
      await this.prisma.faceScanJob.update({
        where: { scanJobId: queued.scanJobId },
        data: {
          status: FaceScanJobStatus.FAILED,
          lastError: message,
          completedAt: new Date(),
        },
      });
      throw new ServiceUnavailableException(
        'Khong the dua face scan retry vao hang doi, vui long thu lai',
      );
    }
  }

  async getScanStatus(
    workspaceId: string,
    mediaId: string,
    requester: FamilyMember,
  ) {
    await this.getVisibleMedia(workspaceId, mediaId, requester);
    const job = await this.prisma.faceScanJob.findFirst({
      where: { workspaceId, mediaId },
      orderBy: { createdAt: 'desc' },
    });
    if (!job) {
      return {
        scanJobId: null,
        status: null,
        statuses: Object.values(FaceScanJobStatus),
        detectedFaceCount: 0,
        suggestionCount: 0,
        startedAt: null,
        completedAt: null,
        error: null,
        maxProcessingSeconds: this.maxProcessingSeconds(),
        retryDelaySeconds: this.retryDelaySeconds,
        forceRescanLimit: this.forceRescanLimit,
        forceRescanCooldownSeconds: this.forceRescanCooldownSeconds,
        staleAt: null,
        retryAllowed: false,
        retryEndpoint: `/families/${workspaceId}/albums/media/${mediaId}/face-scan/retry`,
      };
    }
    return this.mapJobSummary(job);
  }

  async listSuggestions(
    workspaceId: string,
    mediaId: string,
    requester: FamilyMember,
  ) {
    const media = await this.getVisibleMedia(workspaceId, mediaId, requester);
    const [suggestions, detections] = await this.prisma.$transaction([
      this.prisma.albumTagSuggestion.findMany({
        where: { workspaceId, mediaId },
        include: suggestionInclude,
        orderBy: [{ createdAt: 'desc' }, { suggestionId: 'desc' }],
      }),
      this.prisma.albumFaceDetection.findMany({
        where: {
          workspaceId,
          mediaId,
          status: {
            in: [
              AlbumFaceDetectionStatus.MATCHED,
              AlbumFaceDetectionStatus.UNMATCHED,
            ],
          },
        },
        include: faceDetectionInclude,
        orderBy: [{ faceIndex: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    return {
      faces: detections.map((detection) =>
        this.mapDetectedFace(detection, media, requester),
      ),
      items: suggestions.map((suggestion) =>
        this.mapSuggestion(suggestion, media, requester),
      ),
      total: suggestions.length,
    };
  }

  async confirmSuggestion(
    workspaceId: string,
    mediaId: string,
    suggestionId: string,
    requester: FamilyMember,
  ) {
    const media = await this.getVisibleMedia(workspaceId, mediaId, requester);
    this.assertConfirmableMedia(media);
    const suggestion = await this.prisma.albumTagSuggestion.findFirst({
      where: { suggestionId, workspaceId, mediaId },
      include: suggestionInclude,
    });
    if (!suggestion) throw new NotFoundException('Không tìm thấy đề xuất tag');
    if (suggestion.status === AlbumTagSuggestionStatus.CONFIRMED) {
      return this.mapSuggestion(suggestion, media, requester);
    }
    if (suggestion.status !== AlbumTagSuggestionStatus.PENDING) {
      throw new ConflictException('Đề xuất tag đã được xử lý');
    }
    if (suggestion.suggestedMember.status !== MemberStatus.ACTIVE) {
      throw new BadRequestException(
        'Thành viên được đề xuất không còn hoạt động',
      );
    }
    if (!this.policy.canMemberAccessMedia(media, suggestion.suggestedMember)) {
      throw new ForbiddenException(
        'Thành viên được đề xuất không còn quyền xem media này',
      );
    }

    let notificationIds: string[] = [];
    const updated = await this.prisma.$transaction(async (tx) => {
      let createdTag = false;
      const existingTag = await tx.albumMediaTag.findUnique({
        where: {
          mediaId_taggedMemberId: {
            mediaId,
            taggedMemberId: suggestion.suggestedMemberId,
          },
        },
      });
      if (!existingTag) {
        await tx.albumMediaTag.create({
          data: {
            mediaId,
            taggedMemberId: suggestion.suggestedMemberId,
            taggedByMemberId: requester.id,
            tagNote: 'Confirmed from face suggestion',
          },
        });
        createdTag = true;
      }
      const saved = await tx.albumTagSuggestion.update({
        where: { suggestionId },
        data: {
          status: AlbumTagSuggestionStatus.CONFIRMED,
          confirmedByMemberId: requester.id,
          confirmedAt: new Date(),
        },
        include: suggestionInclude,
      });
      if (createdTag && suggestion.suggestedMemberId !== requester.id) {
        const { ids } = await this.notifications.notify(
          workspaceId,
          [suggestion.suggestedMemberId],
          {
            type: NotificationType.ALBUM_TAG,
            priority: NotificationPriority.NORMAL,
            title: 'Bạn được gắn thẻ trong một nội dung album',
            body: `${this.displayName(requester)} đã xác nhận gắn thẻ bạn từ đề xuất khuôn mặt.`,
            referenceType: 'ALBUM_MEDIA',
            referenceId: mediaId,
          },
          { tx },
        );
        notificationIds = ids;
      }
      return saved;
    });

    await this.notifications.dispatch(notificationIds);

    return this.mapSuggestion(updated, media, requester);
  }

  async rejectSuggestion(
    workspaceId: string,
    mediaId: string,
    suggestionId: string,
    requester: FamilyMember,
  ) {
    const media = await this.getVisibleMedia(workspaceId, mediaId, requester);
    const suggestion = await this.prisma.albumTagSuggestion.findFirst({
      where: { suggestionId, workspaceId, mediaId },
      include: suggestionInclude,
    });
    if (!suggestion) throw new NotFoundException('Không tìm thấy đề xuất tag');
    if (suggestion.status === AlbumTagSuggestionStatus.REJECTED) {
      return this.mapSuggestion(suggestion, media, requester);
    }
    if (suggestion.status !== AlbumTagSuggestionStatus.PENDING) {
      throw new ConflictException('Đề xuất tag đã được xử lý');
    }
    const updated = await this.prisma.albumTagSuggestion.update({
      where: { suggestionId },
      data: {
        status: AlbumTagSuggestionStatus.REJECTED,
        rejectedByMemberId: requester.id,
        rejectedAt: new Date(),
      },
      include: suggestionInclude,
    });
    return this.mapSuggestion(updated, media, requester);
  }

  parseJob(raw: unknown): AlbumFaceScanQueueJob | null {
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
      value.version !== FACE_SCAN_JOB_VERSION ||
      value.type !== FACE_SCAN_JOB_TYPE ||
      typeof value.scanJobId !== 'string' ||
      !uuid.test(value.scanJobId) ||
      typeof value.mediaId !== 'string' ||
      !uuid.test(value.mediaId) ||
      typeof value.workspaceId !== 'string' ||
      !uuid.test(value.workspaceId) ||
      typeof value.requestedAt !== 'string' ||
      Number.isNaN(Date.parse(value.requestedAt))
    ) {
      return null;
    }
    return value as unknown as AlbumFaceScanQueueJob;
  }

  async processJob(
    job: AlbumFaceScanQueueJob,
  ): Promise<ModerationProcessResult> {
    const scanJob = await this.prisma.faceScanJob.findFirst({
      where: {
        scanJobId: job.scanJobId,
        workspaceId: job.workspaceId,
        mediaId: job.mediaId,
      },
      include: { media: true },
    });
    if (!scanJob) return { action: 'ACK' };
    if (
      scanJob.status === FaceScanJobStatus.COMPLETED ||
      scanJob.status === FaceScanJobStatus.FAILED
    ) {
      return { action: 'ACK' };
    }

    const staleBefore = new Date(Date.now() - this.staleMinutes * 60 * 1000);
    const claimed = await this.prisma.faceScanJob.updateMany({
      where: {
        scanJobId: job.scanJobId,
        workspaceId: job.workspaceId,
        mediaId: job.mediaId,
        OR: [
          { status: FaceScanJobStatus.PENDING },
          {
            status: FaceScanJobStatus.PROCESSING,
            startedAt: { lt: staleBefore },
          },
        ],
      },
      data: {
        status: FaceScanJobStatus.PROCESSING,
        startedAt: new Date(),
        attemptCount: { increment: 1 },
        lastError: null,
      },
    });
    if (claimed.count !== 1) return { action: 'ACK' };

    const attempt = scanJob.attemptCount + 1;
    try {
      this.assertScannableMedia(scanJob.media);
      const detections = await this.detectStoredMedia(scanJob.media);
      const candidates = await this.loadMatchCandidates(job.workspaceId);
      const alreadyTaggedMemberIds = await this.loadAlreadyTaggedMemberIds(
        job.mediaId,
      );
      const prepared = detections.map((face) => ({
        face,
        match: this.matchFace(
          face,
          candidates,
          scanJob.media,
          alreadyTaggedMemberIds,
        ),
      }));
      await this.persistScanResults(scanJob, prepared);
      return { action: 'ACK' };
    } catch (error) {
      const message = sanitizeModerationError(error);
      const transient = this.isTransient(error);
      if (transient && attempt < this.maxAttempts) {
        await this.prisma.faceScanJob.updateMany({
          where: {
            scanJobId: job.scanJobId,
            workspaceId: job.workspaceId,
            mediaId: job.mediaId,
            status: FaceScanJobStatus.PROCESSING,
          },
          data: {
            status: FaceScanJobStatus.PENDING,
            startedAt: null,
            lastError: message,
          },
        });
        return { action: 'RETRY', retryDelaySeconds: this.retryDelaySeconds };
      }
      await this.failJob(job, message);
      return { action: 'ACK' };
    }
  }

  async completePoisonedJob(
    job: AlbumFaceScanQueueJob,
    error: unknown,
  ): Promise<void> {
    await this.failJob(job, sanitizeModerationError(error));
  }

  async expirePendingSuggestionsForMember(
    workspaceId: string,
    memberId: string,
  ) {
    await this.prisma.albumTagSuggestion.updateMany({
      where: {
        workspaceId,
        suggestedMemberId: memberId,
        status: AlbumTagSuggestionStatus.PENDING,
      },
      data: { status: AlbumTagSuggestionStatus.EXPIRED },
    });
  }

  private async detectStoredMedia(media: ScannableMedia) {
    if (!media.storageKey || !media.mimeType) {
      throw new BadRequestException('Media thiếu private storage');
    }
    const object = await this.storage.downloadFileByKey(media.storageKey);
    if (object.contentType && object.contentType !== media.mimeType) {
      throw new BadRequestException(
        'Content-Type R2 không khớp metadata media',
      );
    }
    validateAlbumFile({
      originalname: media.originalFileName ?? 'photo',
      mimetype: media.mimeType,
      size: object.buffer.length,
      buffer: object.buffer,
    });
    const response = await this.faceAi.detectFaces({
      originalname: media.originalFileName ?? 'photo',
      mimetype: media.mimeType,
      size: object.buffer.length,
      buffer: object.buffer,
    });
    return response.faces.map((face) => ({
      ...face,
      modelName: response.modelName,
      modelVersion: response.modelVersion,
    }));
  }

  private async loadMatchCandidates(
    workspaceId: string,
  ): Promise<MatchCandidate[]> {
    const profiles = await this.prisma.memberFaceProfile.findMany({
      where: {
        workspaceId,
        status: FaceProfileStatus.ACTIVE,
        deletedAt: null,
        member: { familyId: workspaceId, status: MemberStatus.ACTIVE },
      },
      include: {
        member: true,
        embeddings: { where: { revokedAt: null } },
      },
    });
    const candidates: MatchCandidate[] = [];
    for (const profile of profiles) {
      if (profile.embeddings.length < 3) continue;
      const vectors = profile.embeddings
        .map((embedding) =>
          this.normalize(
            this.crypto.decryptEmbedding(
              embedding.encryptedEmbedding,
              embedding.encryptionIv,
              embedding.encryptionAuthTag,
              embedding.embeddingDimension,
            ),
          ),
        )
        .filter((vector): vector is number[] => vector !== null);
      const centroid = this.centroid(vectors);
      if (centroid) {
        candidates.push({ member: profile.member, centroid });
      }
    }
    return candidates;
  }

  private async loadAlreadyTaggedMemberIds(mediaId: string) {
    const tags = await this.prisma.albumMediaTag.findMany({
      where: { mediaId },
      select: { taggedMemberId: true },
    });
    return new Set(tags.map((tag) => tag.taggedMemberId));
  }

  private matchFace(
    face: FaceDetectionResult,
    candidates: MatchCandidate[],
    media: ScannableMedia,
    alreadyTaggedMemberIds: Set<string>,
  ): FaceMatch | null {
    const vector = this.normalize(face.embedding);
    if (!vector) return null;
    const scores = candidates
      .filter((candidate) => !alreadyTaggedMemberIds.has(candidate.member.id))
      .map((candidate) => ({
        member: candidate.member,
        score: this.cosine(vector, candidate.centroid),
      }))
      .sort((a, b) => b.score - a.score);
    const top1 = scores[0];
    if (!top1) return null;
    const top2Score = scores[1]?.score ?? null;
    const margin = top2Score === null ? top1.score : top1.score - top2Score;
    const requiredSimilarity =
      scores.length === 1
        ? Math.max(this.minSimilarity, this.singleCandidateMinSimilarity)
        : this.minSimilarity;
    if (
      top1.score < requiredSimilarity ||
      margin < this.minMargin ||
      !this.policy.canMemberAccessMedia(media, top1.member)
    ) {
      return null;
    }
    return {
      memberId: top1.member.id,
      top1Score: this.score(top1.score),
      top2Score: top2Score === null ? null : this.score(top2Score),
      margin: this.score(margin),
    };
  }

  private async persistScanResults(
    scanJob: FaceScanJob,
    results: Array<{
      face: FaceDetectionResult & { modelName: string; modelVersion: string };
      match: FaceMatch | null;
    }>,
  ) {
    const completedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.albumTagSuggestion.updateMany({
        where: {
          workspaceId: scanJob.workspaceId,
          mediaId: scanJob.mediaId,
          status: AlbumTagSuggestionStatus.PENDING,
        },
        data: { status: AlbumTagSuggestionStatus.EXPIRED },
      });
      await tx.albumFaceDetection.updateMany({
        where: {
          workspaceId: scanJob.workspaceId,
          mediaId: scanJob.mediaId,
          status: {
            in: [
              AlbumFaceDetectionStatus.MATCHED,
              AlbumFaceDetectionStatus.UNMATCHED,
            ],
          },
        },
        data: { status: AlbumFaceDetectionStatus.SUPERSEDED },
      });
      for (const item of results) {
        const detection = await tx.albumFaceDetection.create({
          data: {
            workspaceId: scanJob.workspaceId,
            scanJobId: scanJob.scanJobId,
            mediaId: scanJob.mediaId,
            faceIndex: item.face.faceIndex,
            boundingBox: item.face
              .boundingBox as unknown as Prisma.InputJsonValue,
            detectionScore: this.score(item.face.detectionScore),
            qualityScore:
              item.face.qualityScore === null ||
              item.face.qualityScore === undefined
                ? null
                : this.score(item.face.qualityScore),
            modelName: item.face.modelName,
            modelVersion: item.face.modelVersion,
            status: item.match
              ? AlbumFaceDetectionStatus.MATCHED
              : AlbumFaceDetectionStatus.UNMATCHED,
          },
        });
        if (item.match) {
          await tx.albumTagSuggestion.create({
            data: {
              workspaceId: scanJob.workspaceId,
              detectionId: detection.detectionId,
              mediaId: scanJob.mediaId,
              suggestedMemberId: item.match.memberId,
              similarityScore: item.match.top1Score,
              secondBestScore: item.match.top2Score,
              scoreMargin: item.match.margin,
              status: AlbumTagSuggestionStatus.PENDING,
            },
          });
        }
      }
      await tx.faceScanJob.update({
        where: { scanJobId: scanJob.scanJobId },
        data: {
          status: FaceScanJobStatus.COMPLETED,
          completedAt,
          lastError: null,
        },
      });
    });
  }

  private async failJob(job: AlbumFaceScanQueueJob, message: string) {
    await this.prisma.faceScanJob.updateMany({
      where: {
        scanJobId: job.scanJobId,
        workspaceId: job.workspaceId,
        mediaId: job.mediaId,
      },
      data: {
        status: FaceScanJobStatus.FAILED,
        completedAt: new Date(),
        lastError: message,
      },
    });
  }

  private async getVisibleMedia(
    workspaceId: string,
    mediaId: string,
    requester: FamilyMember,
  ) {
    const media = await this.prisma.albumMedia.findFirst({
      where: { id: mediaId, workspaceId, deletedAt: null },
    });
    if (!media || !this.policy.canMemberAccessMedia(media, requester)) {
      throw new NotFoundException('Không tìm thấy media');
    }
    return media;
  }

  private assertScannableMedia(media: ScannableMedia) {
    if (media.deletedAt)
      throw new BadRequestException('Không thể quét media đã xóa');
    if (media.mediaType !== AlbumMediaType.PHOTO) {
      throw new BadRequestException('Face scan chỉ hỗ trợ ảnh');
    }
    if (media.moderationStatus !== MediaModerationStatus.SAFE) {
      throw new BadRequestException('Chỉ có thể face scan media SAFE');
    }
    if (!media.storageKey) {
      throw new BadRequestException('Media thiếu private storageKey');
    }
  }

  private assertConfirmableMedia(media: ScannableMedia) {
    if (media.deletedAt)
      throw new BadRequestException('Không thể xác nhận media đã xóa');
    if (media.moderationStatus !== MediaModerationStatus.SAFE) {
      throw new BadRequestException('Chỉ có thể xác nhận tag trên media SAFE');
    }
  }

  private canForceScan(media: ScannableMedia, member: FamilyMember) {
    return (
      media.uploadedByMemberId === member.id || this.policy.isManager(member)
    );
  }

  private assertForceScanRateLimit(memberId: string) {
    const now = Date.now();
    const windowMs = this.forceRescanCooldownSeconds * 1000;
    const hits = (this.forceScanHits.get(memberId) ?? []).filter(
      (hit) => now - hit < windowMs,
    );
    if (hits.length >= this.forceRescanLimit) {
      const oldestHit = Math.min(...hits);
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((windowMs - (now - oldestHit)) / 1000),
      );
      throw new HttpException(
        {
          message:
            'Ban da yeu cau quet lai qua nhieu lan, vui long thu lai sau',
          code: FACE_SCAN_FORCE_RESCAN_RATE_LIMITED,
          errorCode: FACE_SCAN_FORCE_RESCAN_RATE_LIMITED,
          feature: FACE_SCAN_FEATURE,
          retryAfterSeconds,
          cooldownSeconds: this.forceRescanCooldownSeconds,
          errors: {
            limit: this.forceRescanLimit,
            windowSeconds: this.forceRescanCooldownSeconds,
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    hits.push(now);
    this.forceScanHits.set(memberId, hits);
  }

  private async mapJobSummary(job: FaceScanJob) {
    const [detectedFaceCount, suggestionCount] = await this.prisma.$transaction(
      [
        this.prisma.albumFaceDetection.count({
          where: {
            workspaceId: job.workspaceId,
            mediaId: job.mediaId,
            scanJobId: job.scanJobId,
          },
        }),
        this.prisma.albumTagSuggestion.count({
          where: { workspaceId: job.workspaceId, mediaId: job.mediaId },
        }),
      ],
    );
    return {
      scanJobId: job.scanJobId,
      status: job.status,
      statuses: Object.values(FaceScanJobStatus),
      detectedFaceCount,
      suggestionCount,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.lastError,
      maxProcessingSeconds: this.maxProcessingSeconds(),
      retryDelaySeconds: this.retryDelaySeconds,
      forceRescanLimit: this.forceRescanLimit,
      forceRescanCooldownSeconds: this.forceRescanCooldownSeconds,
      staleAt: this.staleAt(job),
      retryAllowed:
        job.status === FaceScanJobStatus.FAILED ||
        ((job.status === FaceScanJobStatus.PENDING ||
          job.status === FaceScanJobStatus.PROCESSING) &&
          this.isJobStale(job)),
      retryEndpoint: `/families/${job.workspaceId}/albums/media/${job.mediaId}/face-scan/retry`,
    };
  }

  private maxProcessingSeconds() {
    return this.staleMinutes * 60;
  }

  private staleAt(job: FaceScanJob) {
    const base = job.startedAt ?? job.createdAt;
    if (
      job.status !== FaceScanJobStatus.PENDING &&
      job.status !== FaceScanJobStatus.PROCESSING
    ) {
      return null;
    }
    return new Date(base.getTime() + this.maxProcessingSeconds() * 1000);
  }

  private isJobStale(job: FaceScanJob) {
    const staleAt = this.staleAt(job);
    return staleAt !== null && staleAt.getTime() <= Date.now();
  }

  private mapSuggestion(
    suggestion: SuggestionWithDetection,
    media: ScannableMedia,
    requester: FamilyMember,
  ) {
    return {
      suggestionId: suggestion.suggestionId,
      detectionId: suggestion.detectionId,
      faceId: suggestion.detectionId,
      faceIndex: suggestion.detection.faceIndex,
      boundingBox: suggestion.detection.boundingBox,
      similarityScore: this.decimalToNumber(suggestion.similarityScore),
      secondBestScore: this.decimalToNumber(suggestion.secondBestScore),
      scoreMargin: this.decimalToNumber(suggestion.scoreMargin),
      status: suggestion.status,
      suggestedMember: {
        memberId: suggestion.suggestedMember.id,
        displayName: this.displayName(suggestion.suggestedMember),
        avatarUrl: suggestion.suggestedMember.user.avatarUrl,
        familyRole: suggestion.suggestedMember.familyRole,
        memberStatus: suggestion.suggestedMember.status,
      },
      permissions: {
        canConfirm:
          suggestion.status === AlbumTagSuggestionStatus.PENDING &&
          this.policy.canMemberAccessMedia(media, requester),
        canReject:
          suggestion.status === AlbumTagSuggestionStatus.PENDING &&
          this.policy.canMemberAccessMedia(media, requester),
      },
    };
  }

  private mapDetectedFace(
    detection: DetectionWithSuggestions,
    media: ScannableMedia,
    requester: FamilyMember,
  ) {
    return {
      faceId: detection.detectionId,
      detectionId: detection.detectionId,
      faceIndex: detection.faceIndex,
      boundingBox: detection.boundingBox,
      detectionScore: this.decimalToNumber(detection.detectionScore),
      qualityScore: this.decimalToNumber(detection.qualityScore),
      status: detection.status,
      candidates: detection.suggestions.map((suggestion) => ({
        suggestionId: suggestion.suggestionId,
        memberId: suggestion.suggestedMember.id,
        displayName: this.displayName(suggestion.suggestedMember),
        avatarUrl: suggestion.suggestedMember.user.avatarUrl,
        score: this.decimalToNumber(suggestion.similarityScore),
        secondBestScore: this.decimalToNumber(suggestion.secondBestScore),
        scoreMargin: this.decimalToNumber(suggestion.scoreMargin),
        status: suggestion.status,
        permissions: {
          canConfirm:
            suggestion.status === AlbumTagSuggestionStatus.PENDING &&
            this.policy.canMemberAccessMedia(media, requester),
          canReject:
            suggestion.status === AlbumTagSuggestionStatus.PENDING &&
            this.policy.canMemberAccessMedia(media, requester),
        },
      })),
    };
  }

  private normalize(vector: number[]): number[] | null {
    const norm = Math.sqrt(
      vector.reduce((sum, value) => sum + value * value, 0),
    );
    if (!Number.isFinite(norm) || norm === 0) return null;
    return vector.map((value) => value / norm);
  }

  private centroid(vectors: number[][]): number[] | null {
    if (vectors.length === 0) return null;
    const dimension = vectors[0].length;
    if (vectors.some((vector) => vector.length !== dimension)) return null;
    const summed = new Array<number>(dimension).fill(0);
    for (const vector of vectors) {
      vector.forEach((value, index) => {
        summed[index] += value;
      });
    }
    return this.normalize(summed.map((value) => value / vectors.length));
  }

  private cosine(left: number[], right: number[]) {
    if (left.length !== right.length) return -1;
    return left.reduce((sum, value, index) => sum + value * right[index], 0);
  }

  private score(value: number) {
    return Math.round(Math.min(1, Math.max(-1, value)) * 10000) / 10000;
  }

  private decimalToNumber(value: Prisma.Decimal | null) {
    return value === null ? null : value.toNumber();
  }

  private displayName(member: {
    displayName: string | null;
    user?: { fullName: string | null };
  }) {
    return member.displayName ?? member.user?.fullName ?? 'Thành viên';
  }

  private isTransient(error: unknown) {
    return (
      error instanceof ServiceUnavailableException ||
      error instanceof StorageObjectNotFoundError
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
