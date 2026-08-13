import { NotificationPriority, NotificationType } from '@prisma/client';

import { WsNotificationChannel } from './ws-notification.channel';
import type { NotificationDelivery } from '../notifications.types';

const makeDelivery = (
  userId: string,
  memberId: string | null,
): NotificationDelivery => ({
  userId,
  memberId,
  notification: {
    id: `n-${userId}`,
    familyId: 'f1',
    type: NotificationType.GENERAL,
    priority: NotificationPriority.NORMAL,
    title: 'T',
    body: 'B',
    referenceType: null,
    referenceId: null,
    createdAt: new Date().toISOString(),
  },
});

describe('WsNotificationChannel', () => {
  it('lỗi count của 1 delivery không chặn unread-count của delivery còn lại', async () => {
    const gateway = { emitToUsers: jest.fn() };
    const prisma = {
      notification: {
        count: jest
          .fn()
          .mockRejectedValueOnce(new Error('db down'))
          .mockResolvedValueOnce(2),
      },
    };
    const channel = new WsNotificationChannel(
      gateway as never,
      prisma as never,
    );

    const d1 = makeDelivery('u1', 'm1');
    const d2 = makeDelivery('u2', 'm2');

    await expect(channel.deliver([d1, d2])).resolves.toBeUndefined();

    // Cả 2 đều nhận notification:new
    expect(gateway.emitToUsers).toHaveBeenCalledWith(
      ['u1'],
      'notification:new',
      d1.notification,
    );
    expect(gateway.emitToUsers).toHaveBeenCalledWith(
      ['u2'],
      'notification:new',
      d2.notification,
    );

    // u1 count lỗi → không có unread-count cho u1, nhưng u2 vẫn nhận
    expect(gateway.emitToUsers).not.toHaveBeenCalledWith(
      ['u1'],
      'notification:unread-count',
      expect.anything(),
    );
    expect(gateway.emitToUsers).toHaveBeenCalledWith(
      ['u2'],
      'notification:unread-count',
      { familyId: 'f1', count: 2 },
    );
    expect(prisma.notification.count).toHaveBeenCalledTimes(2);
  });

  it('push-only (memberId = null) không truy vấn badge', async () => {
    const gateway = { emitToUsers: jest.fn() };
    const prisma = { notification: { count: jest.fn() } };
    const channel = new WsNotificationChannel(
      gateway as never,
      prisma as never,
    );

    await channel.deliver([makeDelivery('u1', null)]);

    expect(gateway.emitToUsers).toHaveBeenCalledTimes(1);
    expect(prisma.notification.count).not.toHaveBeenCalled();
  });
});
