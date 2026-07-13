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
    const service = new NotificationsService(
      prisma as unknown as PrismaService,
    );

    await service.createForMembers('family-1', ['member-1'], input);
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
  });

  it('uses supplied transaction client', async () => {
    const prisma = { notification: { createMany: jest.fn() } };
    const tx = {
      notification: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const service = new NotificationsService(
      prisma as unknown as PrismaService,
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
