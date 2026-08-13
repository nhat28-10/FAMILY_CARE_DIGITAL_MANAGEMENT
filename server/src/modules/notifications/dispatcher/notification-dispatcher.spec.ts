import { NotificationPriority, NotificationType } from '@prisma/client';

import { NotificationDispatcher } from './notification-dispatcher';
import type { NotificationDelivery } from '../notifications.types';

const delivery: NotificationDelivery = {
  userId: 'u1',
  memberId: 'm1',
  notification: {
    id: 'n1',
    familyId: 'f1',
    type: NotificationType.GENERAL,
    priority: NotificationPriority.NORMAL,
    title: 'T',
    body: 'B',
    referenceType: null,
    referenceId: null,
    createdAt: new Date().toISOString(),
  },
};

describe('NotificationDispatcher', () => {
  it('gọi mọi channel; 1 channel lỗi không chặn channel còn lại', async () => {
    const ws = {
      name: 'ws',
      deliver: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const fcm = {
      name: 'fcm',
      deliver: jest.fn().mockResolvedValue(undefined),
    };
    const dispatcher = new NotificationDispatcher(ws as never, fcm as never);
    await expect(dispatcher.dispatch([delivery])).resolves.toBeUndefined();
    expect(ws.deliver).toHaveBeenCalledWith([delivery]);
    expect(fcm.deliver).toHaveBeenCalledWith([delivery]);
  });

  it('deliveries rỗng: không gọi channel nào', async () => {
    const ws = { name: 'ws', deliver: jest.fn() };
    const fcm = { name: 'fcm', deliver: jest.fn() };
    const dispatcher = new NotificationDispatcher(ws as never, fcm as never);
    await dispatcher.dispatch([]);
    expect(ws.deliver).not.toHaveBeenCalled();
  });
});
