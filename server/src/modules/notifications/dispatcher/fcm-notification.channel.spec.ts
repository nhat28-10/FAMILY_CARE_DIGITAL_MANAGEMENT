const sendEach = jest.fn();
jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  messaging: () => ({ sendEach }),
}));

import { NotificationPriority, NotificationType } from '@prisma/client';

import { FcmNotificationChannel } from './fcm-notification.channel';

const delivery = {
  userId: 'u1',
  memberId: 'm1',
  notification: {
    id: 'n1',
    familyId: 'f1',
    type: NotificationType.SOS,
    priority: NotificationPriority.CRITICAL,
    title: 'SOS',
    body: 'B',
    referenceType: 'SOS_ALERT',
    referenceId: 'a1',
    createdAt: new Date().toISOString(),
  },
};

describe('FcmNotificationChannel', () => {
  let prisma: {
    deviceToken: { findMany: jest.Mock; deleteMany: jest.Mock };
  };
  let config: { get: jest.Mock };

  beforeEach(() => {
    sendEach.mockReset();
    prisma = {
      deviceToken: {
        findMany: jest.fn().mockResolvedValue([
          { token: 'tok-1', userId: 'u1' },
          { token: 'tok-2', userId: 'u1' },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    config = { get: jest.fn().mockReturnValue('eyJmYWtlIjoxfQ==') }; // base64 {"fake":1}
  });

  function makeChannel() {
    const channel = new FcmNotificationChannel(
      config as never,
      prisma as never,
    );
    channel.onModuleInit();
    return channel;
  }

  it('gửi 1 message/token của user nhận, priority CRITICAL → android high', async () => {
    sendEach.mockResolvedValue({
      responses: [{ success: true }, { success: true }],
    });
    await makeChannel().deliver([delivery]);
    expect(sendEach).toHaveBeenCalledTimes(1);
    const messages = sendEach.mock.calls[0][0];
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      token: 'tok-1',
      notification: { title: 'SOS', body: 'B' },
      android: { priority: 'high' },
      data: expect.objectContaining({ type: 'SOS', referenceId: 'a1' }),
    });
  });

  it('SOS_ALERT → channel sos_alerts, data mang cả title/body cho FE render', async () => {
    sendEach.mockResolvedValue({
      responses: [{ success: true }, { success: true }],
    });
    await makeChannel().deliver([delivery]);
    const messages = sendEach.mock.calls[0][0];
    expect(messages[0]).toMatchObject({
      android: {
        priority: 'high',
        notification: { channelId: 'sos_alerts' },
      },
      data: expect.objectContaining({ title: 'SOS', body: 'B' }),
    });
  });

  it('notification thường → channel general_notifications, priority normal', async () => {
    sendEach.mockResolvedValue({
      responses: [{ success: true }, { success: true }],
    });
    await makeChannel().deliver([
      {
        ...delivery,
        notification: {
          ...delivery.notification,
          type: NotificationType.TASK,
          priority: NotificationPriority.NORMAL,
          referenceType: 'TASK_ASSIGNMENT',
        },
      },
    ]);
    const messages = sendEach.mock.calls[0][0];
    expect(messages[0]).toMatchObject({
      android: {
        priority: 'normal',
        notification: { channelId: 'general_notifications' },
      },
    });
  });

  it('token bị báo not-registered → xóa khỏi device_tokens', async () => {
    sendEach.mockResolvedValue({
      responses: [
        {
          success: false,
          error: { code: 'messaging/registration-token-not-registered' },
        },
        { success: true },
      ],
    });
    await makeChannel().deliver([delivery]);
    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['tok-1'] } },
    });
  });

  it('thiếu FIREBASE_SERVICE_ACCOUNT → disabled, không gửi, không throw', async () => {
    config.get.mockReturnValue('');
    await makeChannel().deliver([delivery]);
    expect(sendEach).not.toHaveBeenCalled();
  });
});
