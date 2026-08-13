import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service';
import { SosSettingsService } from './sos-settings.service';

describe('SosSettingsService', () => {
  const workspaceId = 'family-id';
  const memberId = 'member-1';
  const settingsRow = {
    id: 'setting-1',
    workspaceId,
    isEnabled: true,
    notifyAllMembers: true,
    autoCreateAlertFromFall: false,
    locationRequired: true,
  };

  let prisma: {
    sosSetting: { upsert: jest.Mock; findUnique: jest.Mock };
    emergencyContact: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      aggregate: jest.Mock;
    };
  };
  let service: SosSettingsService;

  beforeEach(() => {
    prisma = {
      sosSetting: {
        upsert: jest.fn().mockResolvedValue(settingsRow),
        findUnique: jest.fn(),
      },
      emergencyContact: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _max: { priorityOrder: null } }),
      },
    };
    service = new SosSettingsService(prisma as unknown as PrismaService);
  });

  it('creates the default settings row on first read', async () => {
    const result = await service.getOrCreate(workspaceId, memberId);

    expect(prisma.sosSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId },
        update: {},
        create: expect.objectContaining({
          workspaceId,
          createdByMemberId: memberId,
        }),
      }),
    );
    expect(result).toEqual(settingsRow);
  });

  it('falls back to schema defaults when no row exists (no write)', async () => {
    prisma.sosSetting.findUnique.mockResolvedValue(null);

    const effective = await service.getEffective(workspaceId);

    expect(effective).toEqual(
      expect.objectContaining({
        isEnabled: true,
        notifyAllMembers: true,
        autoCreateAlertFromFall: false,
        locationRequired: true,
      }),
    );
    expect(prisma.sosSetting.upsert).not.toHaveBeenCalled();
  });

  it('upserts the provided fields on update even when the row is missing', async () => {
    await service.update(workspaceId, memberId, { isEnabled: false });

    expect(prisma.sosSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId },
        update: { isEnabled: false },
        create: expect.objectContaining({
          workspaceId,
          createdByMemberId: memberId,
          isEnabled: false,
        }),
      }),
    );
  });

  it('appends a new contact with the next priority order', async () => {
    prisma.emergencyContact.aggregate.mockResolvedValue({
      _max: { priorityOrder: 2 },
    });
    prisma.emergencyContact.create.mockResolvedValue({ id: 'c1' });

    await service.addContact(workspaceId, memberId, {
      contactName: 'Bác Hai',
      phoneNumber: '+84901234567',
    });

    expect(prisma.emergencyContact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sosSettingId: settingsRow.id,
        contactName: 'Bác Hai',
        phoneNumber: '+84901234567',
        priorityOrder: 3,
        isActive: true,
      }),
    });
  });

  it('starts priority order at 1 for the first contact', async () => {
    prisma.emergencyContact.create.mockResolvedValue({ id: 'c1' });

    await service.addContact(workspaceId, memberId, {
      contactName: 'Bác Hai',
      phoneNumber: '+84901234567',
    });

    const data = prisma.emergencyContact.create.mock.calls[0][0].data as {
      priorityOrder: number;
    };
    expect(data.priorityOrder).toBe(1);
  });

  it('rejects updating a contact that belongs to another family', async () => {
    prisma.emergencyContact.findFirst.mockResolvedValue(null);

    await expect(
      service.updateContact(workspaceId, 'contact-x', { isActive: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.emergencyContact.update).not.toHaveBeenCalled();
  });

  it('deletes a contact scoped to the family', async () => {
    prisma.emergencyContact.findFirst.mockResolvedValue({ id: 'c1' });
    prisma.emergencyContact.delete.mockResolvedValue({ id: 'c1' });

    await service.removeContact(workspaceId, 'c1');

    expect(prisma.emergencyContact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1', sosSetting: { workspaceId } },
      }),
    );
    expect(prisma.emergencyContact.delete).toHaveBeenCalledWith({
      where: { id: 'c1' },
    });
  });
});
