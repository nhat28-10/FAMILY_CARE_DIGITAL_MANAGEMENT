import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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

@Injectable()
export class SosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly familyMembersService: FamilyMembersService,
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
    await this.notificationsService.createForMembers(
      workspaceId,
      recipientIds,
      {
        type: NotificationType.SOS,
        priority: NotificationPriority.CRITICAL,
        title: 'Cảnh báo SOS',
        body: `${triggeredByName} đã kích hoạt SOS`,
        referenceType: 'SOS_ALERT',
        referenceId: alert.sosAlertId,
      },
    );

    this.sosGateway.emitNewAlert(workspaceId, alert);
    return alert;
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
      where: { sosAlertId: alertId, workspaceId },
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
    dto: PushSosLocationDto,
  ) {
    await this.assertActiveAlert(workspaceId, alertId);

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
        where: { sosAlertId: alertId },
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
    return updated;
  }

  /** Loads the alert, ensures it belongs to the workspace and is still ACTIVE. */
  private async assertActiveAlert(workspaceId: string, alertId: string) {
    const alert = await this.prisma.sosAlert.findFirst({
      where: { sosAlertId: alertId, workspaceId },
    });
    if (!alert) {
      throw new NotFoundException('Không tìm thấy cảnh báo SOS');
    }
    if (alert.status !== SosAlertStatus.ACTIVE) {
      throw new BadRequestException('Cảnh báo SOS đã kết thúc');
    }
    return alert;
  }
}
