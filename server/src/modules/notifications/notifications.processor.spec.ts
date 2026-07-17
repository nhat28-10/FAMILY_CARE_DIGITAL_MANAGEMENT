import { NotificationPriority, NotificationType } from '@prisma/client';

import { NotificationsProcessor } from './notifications.processor';

describe('NotificationsProcessor', () => {
  let prisma: { notification: { findMany: jest.Mock } };
  let dispatcher: { dispatch: jest.Mock };
  let reminders: { scan: jest.Mock };
  let processor: NotificationsProcessor;

  beforeEach(() => {
    prisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'n1',
            familyId: 'f1',
            recipientMemberId: 'm1',
            type: NotificationType.GENERAL,
            priority: NotificationPriority.NORMAL,
            title: 'T',
            body: 'B',
            referenceType: null,
            referenceId: null,
            createdAt: new Date('2026-07-15T00:00:00Z'),
            recipientMember: { userId: 'u1' },
          },
        ]),
      },
    };
    dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) };
    reminders = { scan: jest.fn().mockResolvedValue(undefined) } as never;
    processor = new NotificationsProcessor(
      prisma as never,
      dispatcher as never,
      reminders as never,
    );
  });

  it('job persisted: load rows + map delivery đúng shape', async () => {
    await processor.process({
      name: 'dispatch',
      data: { kind: 'persisted', notificationIds: ['n1'] },
    } as never);
    expect(dispatcher.dispatch).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: 'u1',
        memberId: 'm1',
        notification: expect.objectContaining({ id: 'n1', familyId: 'f1' }),
      }),
    ]);
  });

  it('job ephemeral: map mỗi userId thành 1 delivery memberId=null, id=null', async () => {
    await processor.process({
      name: 'dispatch',
      data: {
        kind: 'ephemeral',
        userIds: ['u1', 'u2'],
        payload: {
          familyId: 'f1',
          type: NotificationType.CHAT,
          priority: NotificationPriority.NORMAL,
          title: 'T',
          body: 'B',
        },
      },
    } as never);
    const deliveries = dispatcher.dispatch.mock.calls[0][0];
    expect(deliveries).toHaveLength(2);
    expect(deliveries[0]).toMatchObject({
      userId: 'u1',
      memberId: null,
      notification: expect.objectContaining({ id: null }),
    });
  });

  it('job reminder-scan: gọi reminders.scan()', async () => {
    await processor.process({ name: 'reminder-scan', data: {} } as never);
    expect(reminders.scan).toHaveBeenCalled();
  });
});
