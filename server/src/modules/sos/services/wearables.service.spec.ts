import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  DevicePairingStatus,
  FamilyRole,
  SensorEventType,
  SosSeverity,
  SosSourceType,
  SosTriggerReason,
  WearableActivationStatus,
  WearableDeviceType,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { SosService } from './sos.service';
import { SosSettingsService } from './sos-settings.service';
import { WearablesService } from './wearables.service';

const defaultSettings = {
  isEnabled: true,
  notifyAllMembers: true,
  autoCreateAlertFromFall: false,
  locationRequired: true,
};

function membership(id: string, familyRole: FamilyRole, userId = `${id}-user`) {
  return { id, familyRole, userId } as Parameters<WearablesService['pair']>[1];
}

describe('WearablesService', () => {
  const workspaceId = 'family-id';
  const owner = membership('member-owner', FamilyRole.FAMILY_MEMBER);
  const manager = membership('member-manager', FamilyRole.FAMILY_MANAGER);
  const stranger = membership('member-other', FamilyRole.FAMILY_MEMBER);

  const pairedDevice = {
    id: 'c0ffee00-0000-0000-0000-000000000001',
    workspaceId,
    ownerMemberId: owner.id,
    ownerUserId: owner.userId,
    deviceType: WearableDeviceType.SMARTWATCH,
    pairingStatus: DevicePairingStatus.PAIRED,
    gpsEnabled: true,
    sosEnabled: true,
  };

  const pairDto = {
    deviceName: 'Đồng hồ của bà',
    deviceType: WearableDeviceType.SMARTWATCH,
    deviceIdentifier: 'SN-001',
  };

  let prisma: {
    wearableDevice: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    wearableActivationSession: { findMany: jest.Mock; updateMany: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
    familyMember: { findFirst: jest.Mock };
    sensorEvent: { create: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    sosAlert: { findFirst: jest.Mock };
  };
  let sosService: { trigger: jest.Mock };
  let settings: { getEffective: jest.Mock };
  let service: WearablesService;

  beforeEach(() => {
    prisma = {
      wearableDevice: {
        create: jest.fn().mockResolvedValue(pairedDevice),
        findFirst: jest.fn().mockImplementation((args?: { where?: object }) => {
          if (
            args?.where &&
            'deviceIdentifier' in args.where &&
            'workspaceId' in args.where
          ) {
            return Promise.resolve(null);
          }
          return Promise.resolve(pairedDevice);
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(pairedDevice),
        delete: jest.fn().mockResolvedValue(pairedDevice),
        count: jest.fn().mockResolvedValue(0),
      },
      wearableActivationSession: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      familyMember: { findFirst: jest.fn() },
      sensorEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: 'event-1' }),
      },
      sosAlert: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    sosService = {
      trigger: jest.fn().mockResolvedValue({ id: 'alert-1' }),
    };
    settings = {
      getEffective: jest.fn().mockResolvedValue(defaultSettings),
    };
    service = new WearablesService(
      prisma as unknown as PrismaService,
      sosService as unknown as SosService,
      settings as unknown as SosSettingsService,
    );
  });

  describe('pair', () => {
    it('pairs a device for the calling member with sane defaults', async () => {
      await service.pair(workspaceId, owner, pairDto);

      expect(prisma.wearableDevice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId,
            ownerMemberId: owner.id,
            ownerUserId: owner.userId,
            pairingStatus: DevicePairingStatus.PAIRED,
            gpsEnabled: true,
            sosEnabled: true,
          }),
        }),
      );
    });

    it('forbids pairing for another member unless manager/deputy', async () => {
      await expect(
        service.pair(workspaceId, stranger, {
          ...pairDto,
          ownerMemberId: owner.id,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.wearableDevice.create).not.toHaveBeenCalled();
    });

    it('lets a manager pair for another ACTIVE member', async () => {
      prisma.familyMember.findFirst.mockResolvedValue({
        id: owner.id,
        userId: owner.userId,
      });

      await service.pair(workspaceId, manager, {
        ...pairDto,
        ownerMemberId: owner.id,
      });

      const data = prisma.wearableDevice.create.mock.calls[0][0].data as {
        ownerMemberId: string;
        ownerUserId: string;
      };
      expect(data.ownerMemberId).toBe(owner.id);
      expect(data.ownerUserId).toBe(owner.userId);
    });

    it('rejects a second paired wearable for the same user account', async () => {
      prisma.wearableDevice.count.mockResolvedValue(1);

      await expect(
        service.pair(workspaceId, owner, pairDto),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('re-pairs an existing unpaired wearable for the same account and identifier', async () => {
      const unpairedDevice = {
        ...pairedDevice,
        pairingStatus: DevicePairingStatus.UNPAIRED,
      };
      prisma.wearableDevice.findFirst.mockResolvedValueOnce(unpairedDevice);

      await service.pair(workspaceId, owner, pairDto);

      expect(prisma.wearableDevice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: unpairedDevice.id },
          data: expect.objectContaining({
            ownerMemberId: owner.id,
            ownerUserId: owner.userId,
            pairingStatus: DevicePairingStatus.PAIRED,
          }),
        }),
      );
      expect(
        prisma.wearableDevice.update.mock.calls[0][0].data,
      ).not.toHaveProperty('deviceIdentifier');
      expect(prisma.wearableDevice.create).not.toHaveBeenCalled();
    });

    it('creates a new wearable after the account no longer has a paired device', async () => {
      prisma.wearableDevice.count.mockResolvedValue(0);

      await service.pair(workspaceId, owner, {
        ...pairDto,
        deviceIdentifier: 'SN-NEW',
      });

      expect(prisma.wearableDevice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerUserId: owner.userId,
            deviceIdentifier: 'SN-NEW',
            pairingStatus: DevicePairingStatus.PAIRED,
          }),
        }),
      );
      expect(prisma.wearableDevice.update).not.toHaveBeenCalled();
    });

    it('marks a live activation session as paired when pairing by FCW code', async () => {
      await service.pair(workspaceId, owner, {
        ...pairDto,
        deviceIdentifier: 'FCW-8SRERK',
      });

      expect(prisma.wearableActivationSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            code: 'FCW-8SRERK',
            status: WearableActivationStatus.PENDING,
          }),
          data: expect.objectContaining({
            status: WearableActivationStatus.PAIRED,
            ownerUserId: owner.userId,
            wearableDeviceId: pairedDevice.id,
          }),
        }),
      );
    });
  });

  describe('getMine', () => {
    it('returns the paired wearable for the current user account', async () => {
      prisma.wearableDevice.findFirst.mockResolvedValue(pairedDevice);

      await service.getMine(owner.userId);

      expect(prisma.wearableDevice.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            ownerUserId: owner.userId,
            pairingStatus: DevicePairingStatus.PAIRED,
          },
        }),
      );
    });
  });

  describe('update / remove', () => {
    it('forbids updating a device you do not own (non-manager)', async () => {
      await expect(
        service.update(workspaceId, pairedDevice.id, stranger, {
          deviceName: 'x',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets the owner unpair their device', async () => {
      await service.update(workspaceId, pairedDevice.id, owner, {
        pairingStatus: DevicePairingStatus.UNPAIRED,
      });

      expect(prisma.wearableDevice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: pairedDevice.id },
          data: expect.objectContaining({
            pairingStatus: DevicePairingStatus.UNPAIRED,
          }),
        }),
      );
    });

    it('revokes wearable refresh token sessions when unpairing', async () => {
      prisma.wearableActivationSession.findMany.mockResolvedValue([
        { claimedRefreshTokenId: 'refresh-session-1' },
      ]);

      await service.update(workspaceId, pairedDevice.id, owner, {
        pairingStatus: DevicePairingStatus.UNPAIRED,
      });

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: ['refresh-session-1'] },
            revokedAt: null,
          },
        }),
      );
    });
  });

  describe('ingestEvent', () => {
    const buttonEvent = { eventType: SensorEventType.SOS_BUTTON_PRESSED };

    it('forbids a member who does not own the device', async () => {
      await expect(
        service.ingestEvent(
          workspaceId,
          pairedDevice.id,
          stranger,
          buttonEvent,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.sensorEvent.create).not.toHaveBeenCalled();
    });

    it('rejects events from an unpaired device', async () => {
      prisma.wearableDevice.findFirst.mockResolvedValue({
        ...pairedDevice,
        pairingStatus: DevicePairingStatus.UNPAIRED,
      });

      try {
        await service.ingestEvent(
          workspaceId,
          pairedDevice.id,
          owner,
          buttonEvent,
        );
        fail('Expected WEARABLE_NOT_PAIRED');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
          code: 'WEARABLE_NOT_PAIRED',
          errorCode: 'WEARABLE_NOT_PAIRED',
        });
      }
    });

    it('creates an SOS alert on SOS_BUTTON_PRESSED and links the event', async () => {
      const result = await service.ingestEvent(
        workspaceId,
        pairedDevice.id,
        owner,
        buttonEvent,
      );

      expect(sosService.trigger).toHaveBeenCalledWith(
        workspaceId,
        owner.id,
        expect.objectContaining({
          sourceType: SosSourceType.WEARABLE,
          triggerReason: SosTriggerReason.MANUAL,
        }),
        pairedDevice.id,
      );
      expect(prisma.sensorEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'event-1' },
          data: { createdSosAlertId: 'alert-1' },
        }),
      );
      expect(result.alertCreated).toBe(true);
    });

    it('records FALL_DETECTED without alert when auto-create is off', async () => {
      const result = await service.ingestEvent(
        workspaceId,
        pairedDevice.id,
        owner,
        {
          eventType: SensorEventType.FALL_DETECTED,
        },
      );

      expect(prisma.sensorEvent.create).toHaveBeenCalled();
      expect(sosService.trigger).not.toHaveBeenCalled();
      expect(result.alertCreated).toBe(false);
    });

    it('creates an alert on FALL_DETECTED when auto-create is on', async () => {
      settings.getEffective.mockResolvedValue({
        ...defaultSettings,
        autoCreateAlertFromFall: true,
      });

      const result = await service.ingestEvent(
        workspaceId,
        pairedDevice.id,
        owner,
        {
          eventType: SensorEventType.FALL_DETECTED,
        },
      );

      expect(sosService.trigger).toHaveBeenCalledWith(
        workspaceId,
        owner.id,
        expect.objectContaining({
          sourceType: SosSourceType.WEARABLE,
          triggerReason: SosTriggerReason.FALL_DETECTION,
        }),
        pairedDevice.id,
      );
      expect(result.alertCreated).toBe(true);
    });

    it('creates a critical alert on HEART_RATE_ABNORMAL with bpm context', async () => {
      const result = await service.ingestEvent(
        workspaceId,
        pairedDevice.id,
        owner,
        {
          eventType: SensorEventType.HEART_RATE_ABNORMAL,
          rawValue: { heartRate: 142 },
        },
      );

      expect(sosService.trigger).toHaveBeenCalledWith(
        workspaceId,
        owner.id,
        expect.objectContaining({
          severity: SosSeverity.CRITICAL,
          message: 'Thiet bi phat hien nhip tim bat thuong (142 bpm)',
        }),
        pairedDevice.id,
      );
      expect(result.alertCreated).toBe(true);
    });

    it('creates a critical alert on low HEART_RATE_ABNORMAL with thresholdLow context', async () => {
      await service.ingestEvent(workspaceId, pairedDevice.id, owner, {
        eventType: SensorEventType.HEART_RATE_ABNORMAL,
        rawValue: { heartRate: 38, thresholdLow: 50, durationSeconds: 30 },
      });

      expect(sosService.trigger).toHaveBeenCalledWith(
        workspaceId,
        owner.id,
        expect.objectContaining({
          severity: SosSeverity.CRITICAL,
          message:
            'Thiet bi phat hien nhip tim thap (38 bpm, nguong 50 bpm) trong 30s',
        }),
        pairedDevice.id,
      );
    });

    it('does not create a duplicate alert while the owner already has one active', async () => {
      prisma.sosAlert.findFirst.mockResolvedValue({ id: 'alert-existing' });

      const result = await service.ingestEvent(
        workspaceId,
        pairedDevice.id,
        owner,
        buttonEvent,
      );

      expect(sosService.trigger).not.toHaveBeenCalled();
      expect(result.alertCreated).toBe(false);
      expect(result.alertId).toBe('alert-existing');
    });

    it('never creates an alert from a device with SOS disabled or family SOS off', async () => {
      prisma.wearableDevice.findFirst.mockResolvedValue({
        ...pairedDevice,
        sosEnabled: false,
      });

      await service.ingestEvent(
        workspaceId,
        pairedDevice.id,
        owner,
        buttonEvent,
      );

      settings.getEffective.mockResolvedValue({
        ...defaultSettings,
        isEnabled: false,
      });
      prisma.wearableDevice.findFirst.mockResolvedValue(pairedDevice);

      await service.ingestEvent(
        workspaceId,
        pairedDevice.id,
        owner,
        buttonEvent,
      );

      expect(sosService.trigger).not.toHaveBeenCalled();
      expect(prisma.sensorEvent.create).toHaveBeenCalledTimes(2);
    });
  });
});
