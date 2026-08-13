import type { NotificationDelivery } from '../notifications.types';

/** Một kênh đẩy notification (WS, FCM, sau này email...). */
export interface NotificationChannel {
  readonly name: string;
  deliver(deliveries: NotificationDelivery[]): Promise<void>;
}
