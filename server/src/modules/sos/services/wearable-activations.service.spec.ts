import {
  BadRequestException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { WearableActivationStatus, WearableDeviceType } from '@prisma/client';

import { AuthService } from '../../auth/auth.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { WearableActivationsService } from './wearable-activations.service';

describe('WearableActivationsService', () => {
  const future = new Date(Date.now() + 60_000);
  const baseSession = {
    id: 'c0ffee00-0000-0000-0000-000000000010',
    code: 'FCW-8SRERK',
    status: WearableActivationStatus.PENDING,
    deviceName: 'Watch',
    deviceType: WearableDeviceType.SMARTWATCH,
    workspaceId: null,
    ownerMemberId: null,
    ownerUserId: null,
    wearableDeviceId: null,
    expiresAt: future,
    claimedAt: null,
  };

  let prisma: {
    wearableActivationSession: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let auth: { issueTokensForUserId: jest.Mock };
  let service: WearableActivationsService;

  beforeEach(() => {
    prisma = {
      wearableActivationSession: {
        create: jest.fn().mockResolvedValue(baseSession),
        findUnique: jest.fn().mockResolvedValue(baseSession),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...baseSession,
            ...data,
          }),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    auth = {
      issueTokensForUserId: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: { id: 'user-1' },
      }),
    };
    service = new WearableActivationsService(
      prisma as unknown as PrismaService,
      auth as unknown as AuthService,
    );
  });

  it('creates a pending activation session with an FCW code', async () => {
    const result = await service.create({ deviceName: 'Watch' });

    expect(prisma.wearableActivationSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: expect.stringMatching(/^FCW-[A-Z2-9]{6}$/),
          deviceName: 'Watch',
          deviceType: WearableDeviceType.SMARTWATCH,
        }),
      }),
    );
    expect(result).toMatchObject({
      sessionId: baseSession.id,
      code: baseSession.code,
      status: WearableActivationStatus.PENDING,
    });
  });

  it('returns status for an existing session', async () => {
    const result = await service.getStatus(baseSession.id);

    expect(prisma.wearableActivationSession.findUnique).toHaveBeenCalledWith({
      where: { id: baseSession.id },
    });
    expect(result.status).toBe(WearableActivationStatus.PENDING);
  });

  it('rejects claim before mobile has paired the code', async () => {
    await expect(service.claim(baseSession.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(auth.issueTokensForUserId).not.toHaveBeenCalled();
  });

  it('claims tokens after the activation session is paired', async () => {
    prisma.wearableActivationSession.findUnique.mockResolvedValue({
      ...baseSession,
      status: WearableActivationStatus.PAIRED,
      ownerUserId: 'user-1',
      wearableDeviceId: 'c0ffee00-0000-0000-0000-000000000001',
    });

    const result = await service.claim(baseSession.id);

    expect(prisma.wearableActivationSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: baseSession.id },
        data: expect.objectContaining({
          status: WearableActivationStatus.CLAIMED,
        }),
      }),
    );
    expect(auth.issueTokensForUserId).toHaveBeenCalledWith('user-1');
    expect(result.accessToken).toBe('access-token');
  });

  it('marks an expired session and rejects claim', async () => {
    prisma.wearableActivationSession.findUnique.mockResolvedValue({
      ...baseSession,
      status: WearableActivationStatus.PAIRED,
      expiresAt: new Date(Date.now() - 60_000),
      ownerUserId: 'user-1',
      wearableDeviceId: 'c0ffee00-0000-0000-0000-000000000001',
    });
    prisma.wearableActivationSession.update.mockResolvedValue({
      ...baseSession,
      status: WearableActivationStatus.EXPIRED,
      expiresAt: new Date(Date.now() - 60_000),
    });

    await expect(service.claim(baseSession.id)).rejects.toBeInstanceOf(
      GoneException,
    );
  });

  it('throws not found for an unknown session', async () => {
    prisma.wearableActivationSession.findUnique.mockResolvedValue(null);

    await expect(service.getStatus(baseSession.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
