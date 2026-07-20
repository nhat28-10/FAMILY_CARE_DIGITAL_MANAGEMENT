import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationPriority } from '@prisma/client';
import * as admin from 'firebase-admin';

import { PrismaService } from '../../../prisma/prisma.service';
import type { NotificationChannel } from './notification-channel';
import type {
  NotificationDelivery,
  NotificationPayload,
} from '../notifications.types';

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);
const FCM_BATCH_SIZE = 500;
/** Channel Android do FE tạo sẵn — SOS dùng Importance.max để xuyên Doze. */
const SOS_CHANNEL_ID = 'sos_alerts';
const DEFAULT_CHANNEL_ID = 'general_notifications';
const SOS_REFERENCE_TYPE = 'SOS_ALERT';

@Injectable()
export class FcmNotificationChannel
  implements NotificationChannel, OnModuleInit
{
  readonly name = 'fcm';
  private readonly logger = new Logger(FcmNotificationChannel.name);
  private enabled = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const raw = this.config.get<string>('firebase.serviceAccount');
    if (!raw) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT trống — kênh FCM bị tắt (chỉ còn WS).',
      );
      return;
    }
    try {
      const serviceAccount = JSON.parse(
        Buffer.from(raw, 'base64').toString('utf8'),
      ) as admin.ServiceAccount;
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }
      this.enabled = true;
    } catch (err) {
      this.logger.error(
        `FIREBASE_SERVICE_ACCOUNT không hợp lệ, tắt FCM: ${(err as Error).message}`,
      );
    }
  }

  async deliver(deliveries: NotificationDelivery[]): Promise<void> {
    if (!this.enabled || deliveries.length === 0) {
      return;
    }
    const userIds = [...new Set(deliveries.map((d) => d.userId))];
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true, userId: true },
    });
    if (tokens.length === 0) {
      return;
    }
    const tokensByUser = new Map<string, string[]>();
    for (const row of tokens) {
      const list = tokensByUser.get(row.userId) ?? [];
      list.push(row.token);
      tokensByUser.set(row.userId, list);
    }

    const messages: admin.messaging.Message[] = deliveries.flatMap((delivery) =>
      (tokensByUser.get(delivery.userId) ?? []).map((token) => ({
        token,
        notification: {
          title: delivery.notification.title,
          body: delivery.notification.body,
        },
        android: {
          priority: this.isHighPriority(delivery.notification.priority)
            ? ('high' as const)
            : ('normal' as const),
          notification: {
            channelId: this.resolveChannelId(delivery.notification),
          },
        },
        data: {
          title: delivery.notification.title,
          body: delivery.notification.body,
          notificationId: delivery.notification.id ?? '',
          type: delivery.notification.type,
          familyId: delivery.notification.familyId ?? '',
          referenceType: delivery.notification.referenceType ?? '',
          referenceId: delivery.notification.referenceId ?? '',
        },
      })),
    );

    const deadTokens: string[] = [];
    for (let i = 0; i < messages.length; i += FCM_BATCH_SIZE) {
      const batch = messages.slice(i, i + FCM_BATCH_SIZE);
      const result = await admin.messaging().sendEach(batch);
      result.responses.forEach((response, index) => {
        if (
          !response.success &&
          response.error &&
          DEAD_TOKEN_CODES.has(response.error.code)
        ) {
          deadTokens.push((batch[index] as { token: string }).token);
        }
      });
    }
    if (deadTokens.length > 0) {
      const uniqueDeadTokens = [...new Set(deadTokens)];
      await this.prisma.deviceToken.deleteMany({
        where: { token: { in: uniqueDeadTokens } },
      });
      this.logger.log(`Đã dọn ${uniqueDeadTokens.length} FCM token chết`);
    }
  }

  private resolveChannelId(notification: NotificationPayload): string {
    return notification.referenceType === SOS_REFERENCE_TYPE
      ? SOS_CHANNEL_ID
      : DEFAULT_CHANNEL_ID;
  }

  private isHighPriority(priority: NotificationPriority): boolean {
    return (
      priority === NotificationPriority.HIGH ||
      priority === NotificationPriority.CRITICAL
    );
  }
}
