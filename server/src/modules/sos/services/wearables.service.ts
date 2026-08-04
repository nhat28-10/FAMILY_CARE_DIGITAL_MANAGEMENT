import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DevicePairingStatus,
  FamilyRole,
  MemberStatus,
  Prisma,
  SensorEventType,
  SosAlertStatus,
  SosSeverity,
  SosSourceType,
  WearableDeviceType,
} from '@prisma/client';
import type { FamilyMember, WearableDevice } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { SosService } from './sos.service';
import { SosSettingsService } from './sos-settings.service';
import type { CreateSensorEventDto } from '../dto/create-sensor-event.dto';
import type { PairWearableDto } from '../dto/pair-wearable.dto';
import type { UpdateWearableDto } from '../dto/update-wearable.dto';

const MANAGER_ROLES: FamilyRole[] = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
];

/** Owner projection embedded in device payloads. */
const ownerInclude = {
  ownerMember: {
    select: {
      id: true,
      displayName: true,
      user: { select: { id: true, fullName: true, avatarUrl: true } },
    },
  },
} satisfies Prisma.WearableDeviceInclude;

/** Latest sensor events returned per device. */
const EVENT_HISTORY_LIMIT = 50;

/** Wearable / simulated device pairing + sensor event ingestion. */
@Injectable()
export class WearablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sosService: SosService,
    private readonly sosSettingsService: SosSettingsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Device pairing CRUD
  // ---------------------------------------------------------------------------

  async pair(
    workspaceId: string,
    currentMember: FamilyMember,
    dto: PairWearableDto,
  ) {
    const ownerMemberId = dto.ownerMemberId ?? currentMember.id;
    let ownerUserId = currentMember.userId;
    if (ownerMemberId !== currentMember.id) {
      if (!MANAGER_ROLES.includes(currentMember.familyRole)) {
        throw new ForbiddenException(
          'Chỉ quản lý gia đình mới được ghép nối thiết bị cho thành viên khác',
        );
      }
      const target = await this.prisma.familyMember.findFirst({
        where: {
          id: ownerMemberId,
          familyId: workspaceId,
          status: MemberStatus.ACTIVE,
        },
        select: { id: true, userId: true },
      });
      if (!target) {
        throw new NotFoundException(
          'Không tìm thấy thành viên nhận thiết bị trong gia đình',
        );
      }
      ownerUserId = target.userId;
    }

    await this.assertNoPairedWearable(ownerUserId);

    try {
      return await this.prisma.wearableDevice.create({
        data: {
          workspaceId,
          ownerMemberId,
          ownerUserId,
          deviceName: dto.deviceName,
          deviceType: dto.deviceType,
          deviceIdentifier: dto.deviceIdentifier,
          pairingStatus: DevicePairingStatus.PAIRED,
          gpsEnabled: dto.gpsEnabled ?? true,
          sosEnabled: dto.sosEnabled ?? true,
        },
        include: ownerInclude,
      });
    } catch (error) {
      this.rethrowUniqueViolation(error);
    }
  }

  list(workspaceId: string) {
    return this.prisma.wearableDevice.findMany({
      where: { workspaceId },
      include: ownerInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  getMine(ownerUserId: string) {
    return this.prisma.wearableDevice.findFirst({
      where: {
        ownerUserId,
        pairingStatus: DevicePairingStatus.PAIRED,
      },
      include: {
        ...ownerInclude,
        workspace: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            status: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async update(
    workspaceId: string,
    deviceId: string,
    currentMember: FamilyMember,
    dto: UpdateWearableDto,
  ) {
    const device = await this.loadDevice(workspaceId, deviceId);
    this.assertOwnerOrManager(device, currentMember);

    // Re-check the account-level wearable rule when a previously unpaired/lost
    // device is paired again.
    const willBePaired =
      (dto.pairingStatus ?? device.pairingStatus) ===
      DevicePairingStatus.PAIRED;
    const isPaired = device.pairingStatus === DevicePairingStatus.PAIRED;
    if (willBePaired && !isPaired) {
      await this.assertNoPairedWearable(device.ownerUserId, device.id);
    }

    try {
      return await this.prisma.wearableDevice.update({
        where: { id: device.id },
        data: { ...dto },
        include: ownerInclude,
      });
    } catch (error) {
      this.rethrowUniqueViolation(error);
    }
  }

  async remove(
    workspaceId: string,
    deviceId: string,
    currentMember: FamilyMember,
  ) {
    const device = await this.loadDevice(workspaceId, deviceId);
    this.assertOwnerOrManager(device, currentMember);
    return this.prisma.wearableDevice.delete({ where: { id: device.id } });
  }

  // ---------------------------------------------------------------------------
  // Sensor events
  // ---------------------------------------------------------------------------

  /**
   * Records a raw sensor event and, for SOS-worthy events, auto-creates an
   * SOS alert on behalf of the device owner (unless one is already active).
   */
  async ingestEvent(
    workspaceId: string,
    deviceId: string,
    currentMember: FamilyMember,
    dto: CreateSensorEventDto,
  ) {
    const device = await this.loadDevice(workspaceId, deviceId);
    if (device.ownerMemberId !== currentMember.id) {
      throw new ForbiddenException(
        'Chỉ chủ thiết bị mới được gửi sự kiện cảm biến',
      );
    }
    if (device.pairingStatus !== DevicePairingStatus.PAIRED) {
      throw new BadRequestException('Thiết bị chưa ở trạng thái ghép nối');
    }

    const event = await this.prisma.sensorEvent.create({
      data: {
        deviceId: device.id,
        eventType: dto.eventType,
        rawValue: (dto.rawValue as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        severity: dto.severity ?? null,
        detectedAt: dto.detectedAt ? new Date(dto.detectedAt) : new Date(),
      },
    });

    if (!(await this.shouldCreateAlert(workspaceId, device, dto.eventType))) {
      return { event, alertId: null, alertCreated: false };
    }

    const existing = await this.prisma.sosAlert.findFirst({
      where: {
        workspaceId,
        triggeredByMemberId: device.ownerMemberId,
        status: SosAlertStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (existing) {
      return { event, alertId: existing.id, alertCreated: false };
    }

    const alert = await this.sosService.trigger(
      workspaceId,
      device.ownerMemberId,
      {
        sourceType:
          device.deviceType === WearableDeviceType.SIMULATED_DEVICE
            ? SosSourceType.SIMULATED_DEVICE
            : SosSourceType.WEARABLE,
        severity: dto.severity ?? this.defaultSeverityForEvent(dto.eventType),
        message:
          dto.eventType === SensorEventType.HEART_RATE_ABNORMAL
            ? this.buildAlertMessage(dto)
            : dto.eventType === SensorEventType.FALL_DETECTED
              ? 'Thiết bị phát hiện té ngã'
              : 'Nút SOS trên thiết bị được nhấn',
      },
      device.id,
    );
    await this.prisma.sensorEvent.update({
      where: { id: event.id },
      data: { createdSosAlertId: alert.id },
    });
    return { event, alertId: alert.id, alertCreated: true };
  }

  async listEvents(workspaceId: string, deviceId: string) {
    const device = await this.loadDevice(workspaceId, deviceId);
    return this.prisma.sensorEvent.findMany({
      where: { deviceId: device.id },
      orderBy: { detectedAt: 'desc' },
      take: EVENT_HISTORY_LIMIT,
    });
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async shouldCreateAlert(
    workspaceId: string,
    device: WearableDevice,
    eventType: SensorEventType,
  ) {
    if (!device.sosEnabled) {
      return false;
    }
    const settings = await this.sosSettingsService.getEffective(workspaceId);
    if (!settings.isEnabled) {
      return false;
    }
    if (eventType === SensorEventType.SOS_BUTTON_PRESSED) {
      return true;
    }
    if (eventType === SensorEventType.FALL_DETECTED) {
      return settings.autoCreateAlertFromFall;
    }
    if (eventType === SensorEventType.HEART_RATE_ABNORMAL) {
      return true;
    }
    return false;
  }

  private defaultSeverityForEvent(eventType: SensorEventType) {
    return eventType === SensorEventType.HEART_RATE_ABNORMAL
      ? SosSeverity.CRITICAL
      : SosSeverity.HIGH;
  }

  private buildAlertMessage(dto: CreateSensorEventDto) {
    const heartRate = this.extractHeartRate(dto.rawValue);
    return heartRate === null
      ? 'Thiet bi phat hien nhip tim bat thuong'
      : `Thiet bi phat hien nhip tim bat thuong (${heartRate} bpm)`;
  }

  private extractHeartRate(rawValue?: Record<string, unknown>) {
    const value = rawValue?.heartRate;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private async loadDevice(workspaceId: string, deviceId: string) {
    const device = await this.prisma.wearableDevice.findFirst({
      where: { id: deviceId, workspaceId },
    });
    if (!device) {
      throw new NotFoundException('Không tìm thấy thiết bị trong gia đình');
    }
    return device;
  }

  private assertOwnerOrManager(device: WearableDevice, member: FamilyMember) {
    if (
      device.ownerMemberId !== member.id &&
      !MANAGER_ROLES.includes(member.familyRole)
    ) {
      throw new ForbiddenException(
        'Chỉ chủ thiết bị hoặc quản lý gia đình mới được thao tác thiết bị này',
      );
    }
  }

  private async assertNoPairedWearable(
    ownerUserId: string,
    excludeDeviceId?: string,
  ) {
    const count = await this.prisma.wearableDevice.count({
      where: {
        ownerUserId,
        pairingStatus: DevicePairingStatus.PAIRED,
        ...(excludeDeviceId ? { id: { not: excludeDeviceId } } : {}),
      },
    });
    if (count > 0) {
      throw new ConflictException(
        'Thành viên đã có một thiết bị SOS đang hoạt động',
      );
    }
  }

  private rethrowUniqueViolation(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = error.meta?.target;
      const fields =
        typeof target === 'string'
          ? [target]
          : Array.isArray(target)
            ? target
            : [];
      if (
        fields.some((field) =>
          [
            'ownerUserId',
            'owner_user_id',
            'wearable_devices_owner_user_paired_unique',
          ].includes(field),
        )
      ) {
        throw new ConflictException('Tai khoan nay da ket noi mot wearable');
      }
      throw new ConflictException(
        'Mã định danh thiết bị đã được dùng trong gia đình',
      );
    }
    throw error;
  }
}
