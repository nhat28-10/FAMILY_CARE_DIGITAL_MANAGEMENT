import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  FamilyRole,
  GpsSourceType,
  SosAlertStatus,
  SosResponseType,
  SosSourceType,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { FamilyMembersService } from '../../family-members/family-members.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SosGateway } from '../sos.gateway';
import { SosService } from './sos.service';
import { SosSettingsService } from './sos-settings.service';

const defaultSettings = {
  isEnabled: true,
  notifyAllMembers: true,
  autoCreateAlertFromFall: false,
  locationRequired: true,
};

describe('SosService location tracking', () => {
  const workspaceId = 'family-id';
  const triggerMemberId = 'trigger-member';
  const otherMemberId = 'other-member';
  const alertId = '1f7a184c-5d85-4e06-a5d9-54b58339f2fd';

  const activeAlert = {
    id: alertId,
    workspaceId,
    triggeredByMemberId: triggerMemberId,
    status: SosAlertStatus.ACTIVE,
  };

  const point = {
    latitude: 10.762622,
    longitude: 106.660172,
    sourceType: GpsSourceType.MOBILE_GPS,
  };

  let prisma: {
    sosAlert: { findFirst: jest.Mock; create: jest.Mock };
    sosLocationPoint: {
      create: jest.Mock;
      createMany: jest.Mock;
      findFirst: jest.Mock;
    };
    sosResponse: { create: jest.Mock };
    wearableDevice: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    sosAlert: { update: jest.Mock };
    sosResponse: { create: jest.Mock };
  };
  let gateway: {
    emitLocation: jest.Mock;
    emitNewAlert: jest.Mock;
    emitResolved: jest.Mock;
    emitResponse: jest.Mock;
    emitToUser: jest.Mock;
  };
  let notifications: { notify: jest.Mock; dispatch: jest.Mock };
  let familyMembers: { listByFamily: jest.Mock };
  let settings: { getEffective: jest.Mock };
  let service: SosService;

  beforeEach(() => {
    prisma = {
      sosAlert: { findFirst: jest.fn(), create: jest.fn() },
      sosLocationPoint: {
        create: jest.fn(),
        createMany: jest.fn(),
        findFirst: jest.fn(),
      },
      sosResponse: { create: jest.fn() },
      wearableDevice: { count: jest.fn() },
      $transaction: jest.fn(),
    };
    tx = {
      sosAlert: { update: jest.fn() },
      sosResponse: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation(
      (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    );
    gateway = {
      emitLocation: jest.fn(),
      emitNewAlert: jest.fn(),
      emitResolved: jest.fn(),
      emitResponse: jest.fn(),
      emitToUser: jest.fn(),
    };
    notifications = {
      notify: jest.fn().mockResolvedValue({ ids: [] }),
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    familyMembers = { listByFamily: jest.fn().mockResolvedValue([]) };
    settings = {
      getEffective: jest.fn().mockResolvedValue(defaultSettings),
    };
    service = new SosService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      familyMembers as unknown as FamilyMembersService,
      gateway as unknown as SosGateway,
      settings as unknown as SosSettingsService,
    );
  });

  it('lets the triggering member push a location point', async () => {
    prisma.sosAlert.findFirst.mockResolvedValue(activeAlert);
    prisma.sosLocationPoint.create.mockResolvedValue({ id: 'p1', ...point });

    await service.pushLocation(workspaceId, alertId, triggerMemberId, point);

    expect(prisma.sosLocationPoint.create).toHaveBeenCalled();
    expect(gateway.emitLocation).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({ sosAlertId: alertId }),
    );
  });

  it('forbids a non-triggering member from pushing location', async () => {
    prisma.sosAlert.findFirst.mockResolvedValue(activeAlert);

    await expect(
      service.pushLocation(workspaceId, alertId, otherMemberId, point),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.sosLocationPoint.create).not.toHaveBeenCalled();
  });

  it('forbids streaming from a device the member does not own', async () => {
    prisma.sosAlert.findFirst.mockResolvedValue(activeAlert);
    prisma.wearableDevice.count.mockResolvedValue(0); // device not owned

    await expect(
      service.pushLocation(workspaceId, alertId, triggerMemberId, {
        ...point,
        deviceId: 'someone-elses-device',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.sosLocationPoint.create).not.toHaveBeenCalled();
  });

  it('rejects pushing to an alert that is no longer active', async () => {
    prisma.sosAlert.findFirst.mockResolvedValue({
      ...activeAlert,
      status: SosAlertStatus.RESOLVED,
    });

    await expect(
      service.pushLocation(workspaceId, alertId, triggerMemberId, point),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('batch-inserts points for the triggering member and emits the latest', async () => {
    prisma.sosAlert.findFirst.mockResolvedValue(activeAlert);
    prisma.sosLocationPoint.createMany.mockResolvedValue({ count: 2 });
    prisma.sosLocationPoint.findFirst.mockResolvedValue({ id: 'p2', ...point });

    const result = await service.pushLocationBatch(
      workspaceId,
      alertId,
      triggerMemberId,
      { points: [point, point] },
    );

    expect(prisma.sosLocationPoint.createMany).toHaveBeenCalled();
    expect(result.count).toBe(2);
    expect(gateway.emitLocation).toHaveBeenCalledTimes(1);
  });

  it('defaults recordedAt in array order so the last batch point is latest', async () => {
    prisma.sosAlert.findFirst.mockResolvedValue(activeAlert);
    prisma.sosLocationPoint.createMany.mockResolvedValue({ count: 3 });
    prisma.sosLocationPoint.findFirst.mockResolvedValue({ id: 'p3', ...point });

    await service.pushLocationBatch(workspaceId, alertId, triggerMemberId, {
      points: [point, point, point],
    });

    const rows = prisma.sosLocationPoint.createMany.mock.calls[0][0]
      .data as Array<{ recordedAt: Date }>;
    const times = rows.map((row) => row.recordedAt.getTime());
    expect(times[0]).toBeLessThan(times[1]);
    expect(times[1]).toBeLessThan(times[2]);
    // recordedAt tự sinh không được nằm ở tương lai.
    expect(times[2]).toBeLessThanOrEqual(Date.now());
  });

  it('forbids a non-triggering member from batch-pushing', async () => {
    prisma.sosAlert.findFirst.mockResolvedValue(activeAlert);

    await expect(
      service.pushLocationBatch(workspaceId, alertId, otherMemberId, {
        points: [point],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.sosLocationPoint.createMany).not.toHaveBeenCalled();
  });

  it('returns the latest known point for a watcher', async () => {
    prisma.sosAlert.findFirst.mockResolvedValue(activeAlert);
    prisma.sosLocationPoint.findFirst.mockResolvedValue({ id: 'p9', ...point });

    const current = await service.getCurrentLocation(workspaceId, alertId);

    expect(current).toEqual(expect.objectContaining({ id: 'p9' }));
    expect(prisma.sosLocationPoint.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sosAlertId: alertId },
        orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    );
  });

  it('signals the trigger device to start streaming on activation', async () => {
    const created = {
      id: alertId,
      triggeredByMember: {
        id: triggerMemberId,
        displayName: 'Người A',
        user: { id: 'user-1', fullName: 'Người A' },
      },
    };
    prisma.sosAlert.create.mockResolvedValue(created);
    familyMembers.listByFamily.mockResolvedValue([
      { id: triggerMemberId },
      { id: otherMemberId },
    ]);

    const result = await service.trigger(workspaceId, triggerMemberId, {
      initialLatitude: 10.762622,
      initialLongitude: 106.660172,
    });

    expect(result).toEqual(expect.objectContaining({ id: alertId }));
    expect(result).not.toHaveProperty('sosAlertId');
    expect(gateway.emitNewAlert).toHaveBeenCalledWith(workspaceId, created);
    expect(gateway.emitToUser).toHaveBeenCalledWith(
      'user-1',
      'sos:track:start',
      expect.objectContaining({ alertId, workspaceId }),
    );
    // Only the *other* member gets the SOS notification, not the trigger.
    expect(notifications.notify).toHaveBeenCalledWith(
      workspaceId,
      [otherMemberId],
      expect.objectContaining({ referenceId: alertId }),
    );
  });

  it('returns the active alert + last location as a join snapshot', async () => {
    prisma.sosAlert.findFirst.mockResolvedValue({
      id: alertId,
      status: SosAlertStatus.ACTIVE,
    });
    prisma.sosLocationPoint.findFirst.mockResolvedValue({ id: 'p1', ...point });

    const snapshot = await service.getActiveAlertForWorkspace(workspaceId);

    expect(snapshot).toEqual({
      alert: expect.objectContaining({ id: alertId }),
      lastLocation: expect.objectContaining({ id: 'p1' }),
    });
  });

  it('returns the existing ACTIVE alert instead of creating a duplicate', async () => {
    const existing = {
      id: alertId,
      status: SosAlertStatus.ACTIVE,
      triggeredByMember: {
        id: triggerMemberId,
        displayName: 'Người A',
        user: { id: 'user-1', fullName: 'Người A' },
      },
    };
    prisma.sosAlert.findFirst.mockResolvedValue(existing);

    // Không kèm tọa độ dù locationRequired đang bật: nút bấm lặp phải trả về
    // alert đang có thay vì rơi vào validate vị trí.
    const result = await service.trigger(workspaceId, triggerMemberId, {});

    expect(result).toEqual(expect.objectContaining({ id: alertId }));
    expect(prisma.sosAlert.create).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(gateway.emitNewAlert).not.toHaveBeenCalled();
    // Vẫn nhắc thiết bị của người kích hoạt tiếp tục stream GPS.
    expect(gateway.emitToUser).toHaveBeenCalledWith(
      'user-1',
      'sos:track:start',
      expect.objectContaining({ alertId, workspaceId }),
    );
  });

  it('blocks manual trigger when the family disabled SOS', async () => {
    settings.getEffective.mockResolvedValue({
      ...defaultSettings,
      isEnabled: false,
    });

    await expect(
      service.trigger(workspaceId, triggerMemberId, {
        initialLatitude: 10.762622,
        initialLongitude: 106.660172,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.sosAlert.create).not.toHaveBeenCalled();
  });

  it('requires initial coordinates for app triggers when locationRequired is on', async () => {
    await expect(
      service.trigger(workspaceId, triggerMemberId, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.sosAlert.create).not.toHaveBeenCalled();
  });

  it('allows wearable triggers without coordinates even when locationRequired', async () => {
    prisma.sosAlert.create.mockResolvedValue({
      id: alertId,
      triggeredByMember: {
        id: triggerMemberId,
        displayName: 'Người A',
        user: { id: 'user-1', fullName: 'Người A' },
      },
    });

    await expect(
      service.trigger(workspaceId, triggerMemberId, {
        sourceType: SosSourceType.WEARABLE,
      }),
    ).resolves.toEqual(expect.objectContaining({ id: alertId }));
  });

  it('notifies only managers/deputies when notifyAllMembers is off', async () => {
    settings.getEffective.mockResolvedValue({
      ...defaultSettings,
      notifyAllMembers: false,
      locationRequired: false,
    });
    prisma.sosAlert.create.mockResolvedValue({
      id: alertId,
      triggeredByMember: {
        id: triggerMemberId,
        displayName: 'Người A',
        user: { id: 'user-1', fullName: 'Người A' },
      },
    });
    familyMembers.listByFamily.mockResolvedValue([
      { id: triggerMemberId, familyRole: FamilyRole.FAMILY_MANAGER },
      { id: 'member-deputy', familyRole: FamilyRole.DEPUTY_MEMBER },
      { id: otherMemberId, familyRole: FamilyRole.FAMILY_MEMBER },
    ]);

    await service.trigger(workspaceId, triggerMemberId, {});

    expect(notifications.notify).toHaveBeenCalledWith(
      workspaceId,
      ['member-deputy'],
      expect.objectContaining({ referenceId: alertId }),
    );
  });

  it('marks the alert FALSE_ALARM when the manager flags it on resolve', async () => {
    prisma.sosAlert.findFirst.mockResolvedValue(activeAlert);
    const closed = {
      id: alertId,
      status: SosAlertStatus.FALSE_ALARM,
      resolvedByMember: { id: otherMemberId },
      resolutionNote: 'Bấm nhầm',
      triggeredByMember: { user: { id: 'user-1' } },
    };
    tx.sosAlert.update.mockResolvedValue(closed);

    const result = await service.resolve(workspaceId, alertId, otherMemberId, {
      resolutionNote: 'Bấm nhầm',
      isFalseAlarm: true,
    });

    expect(tx.sosAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SosAlertStatus.FALSE_ALARM,
        }),
      }),
    );
    expect(result.status).toBe(SosAlertStatus.FALSE_ALARM);
    expect(gateway.emitResolved).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({ status: SosAlertStatus.FALSE_ALARM }),
    );
  });

  it('keeps RESOLVED as the default close status', async () => {
    prisma.sosAlert.findFirst.mockResolvedValue(activeAlert);
    tx.sosAlert.update.mockResolvedValue({
      id: alertId,
      status: SosAlertStatus.RESOLVED,
      resolvedByMember: { id: otherMemberId },
      resolutionNote: null,
      triggeredByMember: { user: { id: 'user-1' } },
    });

    await service.resolve(workspaceId, alertId, otherMemberId, {});

    const data = tx.sosAlert.update.mock.calls[0][0].data as {
      status: SosAlertStatus;
    };
    expect(data.status).toBe(SosAlertStatus.RESOLVED);
  });

  it('accepts ON_THE_WAY as a member response type', async () => {
    prisma.sosAlert.findFirst.mockResolvedValue(activeAlert);
    prisma.sosResponse.create.mockResolvedValue({
      id: 'r1',
      responseType: SosResponseType.ON_THE_WAY,
    });

    const response = await service.respond(
      workspaceId,
      alertId,
      otherMemberId,
      { responseType: SosResponseType.ON_THE_WAY },
    );

    expect(response).toEqual(
      expect.objectContaining({ responseType: SosResponseType.ON_THE_WAY }),
    );
    expect(gateway.emitResponse).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({ sosAlertId: alertId }),
    );
  });

  it('embeds the responder phone in alert detail member summaries', async () => {
    prisma.sosAlert.findFirst.mockResolvedValue({ id: alertId });

    await service.getAlert(workspaceId, alertId);

    const include = prisma.sosAlert.findFirst.mock.calls[0][0].include as {
      triggeredByMember: { select: { user: { select: { phone?: boolean } } } };
      responses: {
        include: {
          responderMember: {
            select: { user: { select: { phone?: boolean } } };
          };
        };
      };
    };
    expect(include.triggeredByMember.select.user.select.phone).toBe(true);
    expect(
      include.responses.include.responderMember.select.user.select.phone,
    ).toBe(true);
  });

  it('returns null snapshot when no alert is active', async () => {
    prisma.sosAlert.findFirst.mockResolvedValue(null);

    const snapshot = await service.getActiveAlertForWorkspace(workspaceId);

    expect(snapshot).toBeNull();
    expect(prisma.sosLocationPoint.findFirst).not.toHaveBeenCalled();
  });
});
