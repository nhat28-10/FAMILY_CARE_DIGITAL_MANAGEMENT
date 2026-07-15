import { Injectable } from '@nestjs/common';

import type { NotificationChannel } from './notification-channel';
import type { NotificationDelivery } from '../notifications.types';

@Injectable()
export class FcmNotificationChannel implements NotificationChannel {
  readonly name = 'fcm';

  async deliver(_deliveries: NotificationDelivery[]): Promise<void> {
    // Hoàn thiện ở task FCM.
  }
}
