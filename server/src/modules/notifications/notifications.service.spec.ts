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

interface MockPrisma {
  notification: {
    createManyAndReturn: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    count: jest.Mock;
  };
  familyMember: {
    findUnique: jest.Mock;
  };
}

function createTestBed() {
  const prisma: MockPrisma = {
    notification: {
      createManyAndReturn: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    familyMember: {
      findUnique: jest.fn(),
    },
  };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const gateway = { emitToUsers: jest.fn() };
  const service = new NotificationsService(
    prisma as never,
    queue as never,
    gateway as never,
  );
  return { prisma, queue, gateway, service };
}

describe('NotificationsService notify / dispatch', () => {
  let prisma: MockPrisma;
  let queue: { add: jest.Mock };
  let service: NotificationsService;

  beforeEach(() => {
    ({ prisma, queue, service } = createTestBed());
  });

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

  it('map mỗi recipient thành 1 row: default priority NORMAL, reference null', async () => {
    prisma.notification.createManyAndReturn.mockResolvedValue([
      { id: 'n1' },
      { id: 'n2' },
    ]);
    await service.notify('family-1', ['m1', 'm2'], input);
    const args = prisma.notification.createManyAndReturn.mock
      .calls[0][0] as never as { data: Record<string, unknown>[] };
    expect(args.data).toEqual([
      {
        familyId: 'family-1',
        recipientMemberId: 'm1',
        type: NotificationType.GENERAL,
        priority: NotificationPriority.NORMAL,
        title: 'T',
        body: 'B',
        referenceType: null,
        referenceId: null,
      },
      {
        familyId: 'family-1',
        recipientMemberId: 'm2',
        type: NotificationType.GENERAL,
        priority: NotificationPriority.NORMAL,
        title: 'T',
        body: 'B',
        referenceType: null,
        referenceId: null,
      },
    ]);
  });

  it('giữ nguyên priority/reference khi caller truyền vào', async () => {
    prisma.notification.createManyAndReturn.mockResolvedValue([{ id: 'n1' }]);
    await service.notify('family-1', ['m1'], {
      ...input,
      priority: NotificationPriority.HIGH,
      referenceType: 'TASK',
      referenceId: 'task-1',
    });
    const args = prisma.notification.createManyAndReturn.mock
      .calls[0][0] as never as { data: Record<string, unknown>[] };
    expect(args.data).toEqual([
      expect.objectContaining({
        priority: NotificationPriority.HIGH,
        referenceType: 'TASK',
        referenceId: 'task-1',
      }),
    ]);
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

  it('notifyUsersEphemeral nuốt lỗi Redis (không throw)', async () => {
    queue.add.mockRejectedValue(new Error('redis down'));
    await expect(
      service.notifyUsersEphemeral(['u1'], {
        familyId: null,
        type: NotificationType.CHAT,
        priority: NotificationPriority.NORMAL,
        title: 'T',
        body: 'B',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('NotificationsService read path', () => {
  let prisma: MockPrisma;
  let gateway: { emitToUsers: jest.Mock };
  let service: NotificationsService;

  beforeEach(() => {
    ({ prisma, gateway, service } = createTestBed());
  });

  it('markRead đã đọc rồi: return sớm, KHÔNG update, KHÔNG emit unread-count', async () => {
    const notification = {
      id: 'n1',
      recipientMemberId: 'm1',
      isRead: true,
    };
    prisma.notification.findUnique.mockResolvedValue(notification);

    const result = await service.markRead('m1', 'n1');
    expect(result).toBe(notification);
    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(gateway.emitToUsers).not.toHaveBeenCalled();
  });

  it('markRead chưa đọc: update rồi emit notification:unread-count tới userId', async () => {
    prisma.notification.findUnique.mockResolvedValue({
      id: 'n1',
      recipientMemberId: 'm1',
      isRead: false,
    });
    const updated = { id: 'n1', recipientMemberId: 'm1', isRead: true };
    prisma.notification.update.mockResolvedValue(updated);
    prisma.familyMember.findUnique.mockResolvedValue({
      userId: 'u1',
      familyId: 'f1',
    });
    prisma.notification.count.mockResolvedValue(3);

    const result = await service.markRead('m1', 'n1');
    expect(result).toBe(updated);
    expect(prisma.notification.update).toHaveBeenCalledTimes(1);
    expect(gateway.emitToUsers).toHaveBeenCalledWith(
      ['u1'],
      'notification:unread-count',
      { familyId: 'f1', count: 3 },
    );
  });

  it('markAllRead: updateMany rồi emit unread-count', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 2 });
    prisma.familyMember.findUnique.mockResolvedValue({
      userId: 'u1',
      familyId: 'f1',
    });
    prisma.notification.count.mockResolvedValue(0);

    const result = await service.markAllRead('m1');
    expect(result).toBeNull();
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientMemberId: 'm1', isRead: false },
      }),
    );
    expect(gateway.emitToUsers).toHaveBeenCalledWith(
      ['u1'],
      'notification:unread-count',
      { familyId: 'f1', count: 0 },
    );
  });

  it('unreadCount đếm notification chưa đọc của member', async () => {
    prisma.notification.count.mockResolvedValue(5);

    const result = await service.unreadCount('m1');
    expect(result).toEqual({ count: 5 });
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { recipientMemberId: 'm1', isRead: false },
    });
  });
});
