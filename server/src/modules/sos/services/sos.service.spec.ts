import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GpsSourceType, SosAlertStatus } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { FamilyMembersService } from '../../family-members/family-members.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SosGateway } from '../sos.gateway';
import { SosService } from './sos.service';

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
    wearableDevice: { count: jest.Mock };
  };
  let gateway: {
    emitLocation: jest.Mock;
    emitNewAlert: jest.Mock;
    emitToUser: jest.Mock;
  };
  let notifications: { notify: jest.Mock; dispatch: jest.Mock };
  let familyMembers: { listByFamily: jest.Mock };
  let service: SosService;

  beforeEach(() => {
    prisma = {
      sosAlert: { findFirst: jest.fn(), create: jest.fn() },
      sosLocationPoint: {
        create: jest.fn(),
        createMany: jest.fn(),
        findFirst: jest.fn(),
      },
      wearableDevice: { count: jest.fn() },
    };
    gateway = {
      emitLocation: jest.fn(),
      emitNewAlert: jest.fn(),
      emitToUser: jest.fn(),
    };
    notifications = {
      notify: jest.fn().mockResolvedValue({ ids: [] }),
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    familyMembers = { listByFamily: jest.fn().mockResolvedValue([]) };
    service = new SosService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      familyMembers as unknown as FamilyMembersService,
      gateway as unknown as SosGateway,
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

    const result = await service.trigger(workspaceId, triggerMemberId, {});

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

  it('returns null snapshot when no alert is active', async () => {
    prisma.sosAlert.findFirst.mockResolvedValue(null);

    const snapshot = await service.getActiveAlertForWorkspace(workspaceId);

    expect(snapshot).toBeNull();
    expect(prisma.sosLocationPoint.findFirst).not.toHaveBeenCalled();
  });
});
