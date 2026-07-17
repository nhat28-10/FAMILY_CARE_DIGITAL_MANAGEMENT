import { Injectable, Logger } from '@nestjs/common';

import { FcmNotificationChannel } from './fcm-notification.channel';
import type { NotificationChannel } from './notification-channel';
import { WsNotificationChannel } from './ws-notification.channel';
import type { NotificationDelivery } from '../notifications.types';

/**
 * Phát 1 lô delivery qua mọi channel. Lỗi 1 channel chỉ log — không chặn
 * channel khác, không fail job (DB đã là source of truth).
 */
@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);
  private readonly channels: NotificationChannel[];

  constructor(ws: WsNotificationChannel, fcm: FcmNotificationChannel) {
    this.channels = [ws, fcm];
  }

  async dispatch(deliveries: NotificationDelivery[]): Promise<void> {
    if (deliveries.length === 0) {
      return;
    }
    for (const channel of this.channels) {
      try {
        await channel.deliver(deliveries);
      } catch (err) {
        this.logger.error(
          `Channel ${channel.name} lỗi: ${(err as Error).message}`,
        );
      }
    }
  }
}
