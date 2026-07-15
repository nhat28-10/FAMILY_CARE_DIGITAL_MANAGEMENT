import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  NotificationPriority,
  NotificationType,
  Prisma,
  SosAlertStatus,
  SosResponseType,
  SosSourceType,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { FamilyMembersService } from '../../family-members/family-members.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SosGateway } from '../sos.gateway';
import type { CreateSosAlertDto } from '../dto/create-sos-alert.dto';
import type { CreateSosResponseDto } from '../dto/create-sos-response.dto';
import type { ListSosAlertQueryDto } from '../dto/list-sos-alert-query.dto';
import type { PushSosLocationBatchDto } from '../dto/push-sos-location-batch.dto';
import type { PushSosLocationDto } from '../dto/push-sos-location.dto';
import type { ResolveSosAlertDto } from '../dto/resolve-sos-alert.dto';

/** Compact member projection embedded in alert/response payloads. */
const memberSummary = {
  select: {
    id: true,
    displayName: true,
    familyRole: true,
    user: {
      select: { id: true, fullName: true, email: true, avatarUrl: true },
    },
  },
} satisfies Prisma.FamilyMemberDefaultArgs;

const alertInclude = {
  triggeredByMember: memberSummary,
  resolvedByMember: memberSummary,
  device: true,
  responses: {
    include: { responderMember: memberSummary },
    orderBy: { respondedAt: 'asc' },
  },
  locationPoints: { orderBy: { recordedAt: 'asc' } },
} satisfies Prisma.SosAlertInclude;

/** Response types a regular member may submit via the respond endpoint. */
const MEMBER_RESPONSE_TYPES: SosResponseType[] = [
  SosResponseType.VIEWED,
  SosResponseType.CONFIRM_SAFE,
  SosResponseType.NEED_HELP,
];

/** Suggested GPS reporting cadence pushed to the trigger device on SOS start. */
const SOS_TRACK_INTERVAL_SEC = 5;

@Injectable()
export class SosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly familyMembersService: FamilyMembersService,
    // SosGateway also depends on SosService (WS ingest) — break the cycle.
    @Inject(forwardRef(() => SosGateway))
    private readonly sosGateway: SosGateway,
  ) {}

  // ---------------------------------------------------------------------------
  // Trigger + read
  // ---------------------------------------------------------------------------

  async trigger(workspaceId: string, memberId: string, dto: CreateSosAlertDto) {
    const alert = await this.prisma.sosAlert.create({
      data: {
        workspaceId,
        triggeredByMemberId: memberId,
        sourceType: dto.sourceType ?? SosSourceType.MOBILE_APP,
        severity: dto.severity ?? null,
        initialLatitude: dto.initialLatitude ?? null,
        initialLongitude: dto.initialLongitude ?? null,
        message: dto.message ?? null,
      },
      include: alertInclude,
    });

    // High-priority fan-out to every other member of the workspace.
    const members = await this.familyMembersService.listByFamily(workspaceId);
    const recipientIds = members
      .map((member) => member.id)
      .filter((id) => id !== memberId);
    const triggeredByName =
      alert.triggeredByMember.displayName ??
      alert.triggeredByMember.user.fullName ??
      'Một thành viên';
    await this.notificationsService.notify(workspaceId, recipientIds, {
      type: NotificationType.SOS,
      priority: NotificationPriority.CRITICAL,
      title: 'Cảnh báo SOS',
      body: `${triggeredByName} đã kích hoạt SOS`,
      referenceType: 'SOS_ALERT',
      referenceId: alert.id,
    });

    this.sosGateway.emitNewAlert(workspaceId, alert);

    // Tell the trigger's own device to start high-frequency GPS streaming.
    this.sosGateway.emitToUser(
      alert.triggeredByMember.user.id,
      'sos:track:start',
      {
        alertId: alert.id,
        workspaceId,
        intervalSec: SOS_TRACK_INTERVAL_SEC,
      },
    );
    return alert;
  }

  /**
   * The workspace's currently-active alert plus its last-known point, or null.
   * Used to hand a watcher an immediate snapshot the moment they join the room.
   */
  async getActiveAlertForWorkspace(workspaceId: string) {
    const alert = await this.prisma.sosAlert.findFirst({
      where: { workspaceId, status: SosAlertStatus.ACTIVE },
      orderBy: { triggeredAt: 'desc' },
      include: { triggeredByMember: memberSummary },
    });
    if (!alert) {
      return null;
    }
    const lastLocation = await this.latestPoint(alert.id);
    return { alert, lastLocation };
  }

  async listAlerts(workspaceId: string, query: ListSosAlertQueryDto) {
    return this.prisma.sosAlert.findMany({
      where: {
        workspaceId,
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        triggeredByMember: memberSummary,
        resolvedByMember: memberSummary,
        _count: { select: { responses: true, locationPoints: true } },
      },
      orderBy: { triggeredAt: 'desc' },
    });
  }

  async getAlert(workspaceId: string, alertId: string) {
    const alert = await this.prisma.sosAlert.findFirst({
      where: { id: alertId, workspaceId },
      include: alertInclude,
    });
    if (!alert) {
      throw new NotFoundException('Không tìm thấy cảnh báo SOS');
    }
    return alert;
  }

  // ---------------------------------------------------------------------------
  // Location / responses
  // ---------------------------------------------------------------------------

  async pushLocation(
    workspaceId: string,
    alertId: string,
    memberId: string,
    dto: PushSosLocationDto,
  ) {
    const alert = await this.assertActiveAlert(workspaceId, alertId);
    await this.assertCanStream(alert, memberId, [dto.deviceId]);

    const point = await this.prisma.sosLocationPoint.create({
      data: {
        sosAlertId: alertId,
        deviceId: dto.deviceId ?? null,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy ?? null,
        sourceType: dto.sourceType,
        recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(),
      },
    });

    this.sosGateway.emitLocation(workspaceId, { sosAlertId: alertId, point });
    return point;
  }

  /**
   * Batch ingest — a device that buffered points while offline flushes them in
   * one request. Same authorization as {@link pushLocation}: only the member
   * who triggered the alert (optionally via their own device) may stream.
   * Broadcasts the most recent point so watchers' maps jump to the live
   * position; the full trajectory is persisted and readable via the alert.
   */
  async pushLocationBatch(
    workspaceId: string,
    alertId: string,
    memberId: string,
    dto: PushSosLocationBatchDto,
  ) {
    const alert = await this.assertActiveAlert(workspaceId, alertId);
    await this.assertCanStream(
      alert,
      memberId,
      dto.points.map((p) => p.deviceId),
    );

    // Point thiếu recordedAt: gán timestamp cách nhau 1ms theo thứ tự mảng
    // (điểm cuối = mới nhất, không vượt quá hiện tại). Nếu cả lô dùng chung
    // một mốc "now" thì orderBy recordedAt hòa nhau và "latest" trở thành
    // ngẫu nhiên (thực tế Postgres trả điểm ĐẦU của lô).
    const fallbackBase = Date.now() - (dto.points.length - 1);
    await this.prisma.sosLocationPoint.createMany({
      data: dto.points.map((p, index) => ({
        sosAlertId: alertId,
        deviceId: p.deviceId ?? null,
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy: p.accuracy ?? null,
        sourceType: p.sourceType,
        recordedAt: p.recordedAt
          ? new Date(p.recordedAt)
          : new Date(fallbackBase + index),
      })),
    });

    const latest = await this.latestPoint(alertId);
    if (latest) {
      this.sosGateway.emitLocation(workspaceId, {
        sosAlertId: alertId,
        point: latest,
      });
    }
    return { count: dto.points.length, latest };
  }

  /**
   * Last-known position of an alert (any status). Lets a watcher joining
   * mid-event render the current location immediately instead of waiting for
   * the next streamed point.
   */
  async getCurrentLocation(workspaceId: string, alertId: string) {
    await this.loadAlert(workspaceId, alertId);
    return this.latestPoint(alertId);
  }

  async respond(
    workspaceId: string,
    alertId: string,
    memberId: string,
    dto: CreateSosResponseDto,
  ) {
    if (!MEMBER_RESPONSE_TYPES.includes(dto.responseType)) {
      throw new BadRequestException('Loại phản hồi không hợp lệ');
    }
    await this.assertActiveAlert(workspaceId, alertId);

    const response = await this.prisma.sosResponse.create({
      data: {
        sosAlertId: alertId,
        responderMemberId: memberId,
        responseType: dto.responseType,
        message: dto.message ?? null,
      },
      include: { responderMember: memberSummary },
    });

    this.sosGateway.emitResponse(workspaceId, {
      sosAlertId: alertId,
      response,
    });
    return response;
  }

  async confirmSafety(workspaceId: string, alertId: string, memberId: string) {
    const alert = await this.assertActiveAlert(workspaceId, alertId);
    if (alert.triggeredByMemberId !== memberId) {
      throw new ForbiddenException('Chỉ người kích hoạt mới xác nhận an toàn');
    }

    const response = await this.prisma.sosResponse.create({
      data: {
        sosAlertId: alertId,
        responderMemberId: memberId,
        responseType: SosResponseType.CONFIRM_SAFE,
        message: 'Người kích hoạt xác nhận an toàn',
      },
      include: { responderMember: memberSummary },
    });

    this.sosGateway.emitResponse(workspaceId, {
      sosAlertId: alertId,
      response,
    });
    return response;
  }

  // ---------------------------------------------------------------------------
  // Resolve / cancel (FAMILY_MANAGER / DEPUTY_MEMBER only — enforced in controller)
  // ---------------------------------------------------------------------------

  resolve(
    workspaceId: string,
    alertId: string,
    memberId: string,
    dto: ResolveSosAlertDto,
  ) {
    return this.closeAlert(
      workspaceId,
      alertId,
      memberId,
      SosAlertStatus.RESOLVED,
      SosResponseType.RESOLVED,
      dto.resolutionNote,
    );
  }

  cancel(
    workspaceId: string,
    alertId: string,
    memberId: string,
    dto: ResolveSosAlertDto,
  ) {
    return this.closeAlert(
      workspaceId,
      alertId,
      memberId,
      SosAlertStatus.CANCELED,
      SosResponseType.CANCELED,
      dto.resolutionNote,
    );
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async closeAlert(
    workspaceId: string,
    alertId: string,
    memberId: string,
    status: SosAlertStatus,
    responseType: SosResponseType,
    note?: string,
  ) {
    await this.assertActiveAlert(workspaceId, alertId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const alert = await tx.sosAlert.update({
        where: { id: alertId },
        data: {
          status,
          resolvedByMemberId: memberId,
          resolvedAt: new Date(),
          resolutionNote: note ?? null,
        },
        include: alertInclude,
      });
      await tx.sosResponse.create({
        data: {
          sosAlertId: alertId,
          responderMemberId: memberId,
          responseType,
          message: note ?? null,
        },
      });
      return alert;
    });

    this.sosGateway.emitResolved(workspaceId, {
      sosAlertId: alertId,
      status: updated.status,
      resolvedBy: updated.resolvedByMember,
      resolutionNote: updated.resolutionNote,
    });

    // The alert is closed — tell the trigger's device to stop streaming GPS.
    this.sosGateway.emitToUser(
      updated.triggeredByMember.user.id,
      'sos:track:stop',
      { alertId },
    );
    return updated;
  }

  /** Loads the alert and ensures it belongs to the workspace. */
  private async loadAlert(workspaceId: string, alertId: string) {
    const alert = await this.prisma.sosAlert.findFirst({
      where: { id: alertId, workspaceId },
    });
    if (!alert) {
      throw new NotFoundException('Không tìm thấy cảnh báo SOS');
    }
    return alert;
  }

  /** Loads the alert, ensures it belongs to the workspace and is still ACTIVE. */
  private async assertActiveAlert(workspaceId: string, alertId: string) {
    const alert = await this.loadAlert(workspaceId, alertId);
    if (alert.status !== SosAlertStatus.ACTIVE) {
      throw new BadRequestException('Cảnh báo SOS đã kết thúc');
    }
    return alert;
  }

  /**
   * Only the member who triggered the alert may stream its location. When
   * points carry a `deviceId`, every referenced device must be paired to that
   * member — a member cannot spoof someone else's tracker.
   */
  private async assertCanStream(
    alert: { triggeredByMemberId: string },
    memberId: string,
    deviceIds: Array<string | null | undefined>,
  ) {
    if (alert.triggeredByMemberId !== memberId) {
      throw new ForbiddenException(
        'Chỉ người kích hoạt SOS mới được gửi vị trí',
      );
    }

    const uniqueDeviceIds = [
      ...new Set(deviceIds.filter((id): id is string => Boolean(id))),
    ];
    if (uniqueDeviceIds.length === 0) {
      return;
    }

    const owned = await this.prisma.wearableDevice.count({
      where: { id: { in: uniqueDeviceIds }, ownerMemberId: memberId },
    });
    if (owned !== uniqueDeviceIds.length) {
      throw new ForbiddenException('Thiết bị không thuộc về bạn');
    }
  }

  /** Most recently recorded GPS point of an alert, or null if none yet. */
  private latestPoint(alertId: string) {
    return this.prisma.sosLocationPoint.findFirst({
      where: { sosAlertId: alertId },
      // createdAt phá hòa khi hai request khác nhau ghi cùng một mốc recordedAt.
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
