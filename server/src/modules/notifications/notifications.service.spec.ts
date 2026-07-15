import { NotificationPriority, NotificationType, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService transaction support', () => {
  const input = {
    type: NotificationType.ALBUM_TAG,
    priority: NotificationPriority.NORMAL,
    title: 'title',
    body: 'body',
    referenceType: 'ALBUM_MEDIA',
    referenceId: 'media-1',
  };

  it('uses PrismaService by default for backward compatibility', async () => {
    const prisma = {
      notification: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const gateway = { emitToUsers: jest.fn() };
    const service = new NotificationsService(
      prisma as unknown as PrismaService,
      queue as never,
      gateway as never,
    );

    await service.createForMembers('family-1', ['member-1'], input);
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
  });

  it('uses supplied transaction client', async () => {
    const prisma = { notification: { createMany: jest.fn() } };
    const tx = {
      notification: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const gateway = { emitToUsers: jest.fn() };
    const service = new NotificationsService(
      prisma as unknown as PrismaService,
      queue as never,
      gateway as never,
    );

    await service.createForMembers(
      'family-1',
      ['member-1'],
      input,
      tx as unknown as Prisma.TransactionClient,
    );
    expect(tx.notification.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });
});

describe('NotificationsService notify / dispatch', () => {
  let prisma: {
    notification: {
      createManyAndReturn: jest.Mock;
    };
    familyMember: {
      findUnique: jest.Mock;
    };
  };
  let queue: { add: jest.Mock };
  let gateway: { emitToUsers: jest.Mock };
  let service: NotificationsService;

  beforeEach(() => {
    prisma = {
      notification: {
        createManyAndReturn: jest.fn(),
      },
      familyMember: {
        findUnique: jest.fn(),
      },
    };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    gateway = { emitToUsers: jest.fn() };
    service = new NotificationsService(
      prisma as never,
      queue as never,
      gateway as never,
    );
  });

  describe('notify / dispatch', () => {
    const input = {
      type: NotificationType.GENERAL,
      title: 'T',
      body: 'B',
    };

    it('không có tx: persist rồi enqueue 1 job dispatch với đủ ids', async () => {
      prisma.notification.createManyAndReturn.mockResolvedValue([
        { id: 'n1' },
        { id: 'n2' },
      ]);
      const result = await service.notify('family-1', ['m1', 'm2'], input);
      expect(result.ids).toEqual(['n1', 'n2']);
      expect(queue.add).toHaveBeenCalledWith('dispatch', {
        kind: 'persisted',
        notificationIds: ['n1', 'n2'],
      });
    });

    it('có tx: chỉ persist bằng tx, KHÔNG enqueue', async () => {
      const tx = {
        notification: {
          createManyAndReturn: jest.fn().mockResolvedValue([{ id: 'n1' }]),
        },
      };
      const result = await service.notify('family-1', ['m1'], input, {
        tx: tx as never,
      });
      expect(result.ids).toEqual(['n1']);
      expect(tx.notification.createManyAndReturn).toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('recipient rỗng: không persist, không enqueue', async () => {
      const result = await service.notify('family-1', [], input);
      expect(result.ids).toEqual([]);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('dispatch nuốt lỗi Redis (không throw)', async () => {
      queue.add.mockRejectedValue(new Error('redis down'));
      await expect(service.dispatch(['n1'])).resolves.toBeUndefined();
    });

    it('notifyUsersEphemeral enqueue job ephemeral', async () => {
      await service.notifyUsersEphemeral(['u1'], {
        familyId: null,
        type: NotificationType.CHAT,
        priority: NotificationPriority.NORMAL,
        title: 'T',
        body: 'B',
      });
      expect(queue.add).toHaveBeenCalledWith('dispatch', {
        kind: 'ephemeral',
        userIds: ['u1'],
        payload: expect.objectContaining({ type: NotificationType.CHAT }),
      });
    });
  });
});
