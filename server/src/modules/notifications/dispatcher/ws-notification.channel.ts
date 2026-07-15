import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsGateway } from '../notifications.gateway';
import type { NotificationChannel } from './notification-channel';
import type { NotificationDelivery } from '../notifications.types';

@Injectable()
export class WsNotificationChannel implements NotificationChannel {
  readonly name = 'ws';

  constructor(
    private readonly gateway: NotificationsGateway,
    private readonly prisma: PrismaService,
  ) {}

  async deliver(deliveries: NotificationDelivery[]): Promise<void> {
    for (const delivery of deliveries) {
      this.gateway.emitToUsers(
        [delivery.userId],
        'notification:new',
        delivery.notification,
      );
    }
    // Badge mới cho các notification đã persist (push-only không đổi badge).
    const persisted = deliveries.filter((d) => d.memberId !== null);
    for (const delivery of persisted) {
      const count = await this.prisma.notification.count({
        where: { recipientMemberId: delivery.memberId!, isRead: false },
      });
      this.gateway.emitToUsers([delivery.userId], 'notification:unread-count', {
        familyId: delivery.notification.familyId,
        count,
      });
    }
  }
}
