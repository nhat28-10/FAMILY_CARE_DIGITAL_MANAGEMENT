import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationDispatcher } from './dispatcher/notification-dispatcher';
import { RemindersService } from './reminders.service';
import {
  DISPATCH_JOB,
  NOTIFICATIONS_QUEUE,
  REMINDER_SCAN_JOB,
} from './notifications.types';
import type {
  DispatchJobData,
  NotificationDelivery,
} from './notifications.types';

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcher,
    private readonly reminders: RemindersService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === DISPATCH_JOB) {
      return this.handleDispatch(job.data as DispatchJobData);
    }
    if (job.name === REMINDER_SCAN_JOB) {
      return this.reminders.scan();
    }
    this.logger.warn(`Job không xác định: ${job.name}`);
  }

  private async handleDispatch(data: DispatchJobData): Promise<void> {
    if (data.kind === 'persisted') {
      const rows = await this.prisma.notification.findMany({
        where: { id: { in: data.notificationIds } },
        include: { recipientMember: { select: { userId: true } } },
      });
      const deliveries: NotificationDelivery[] = rows.map((row) => ({
        userId: row.recipientMember.userId,
        memberId: row.recipientMemberId,
        notification: {
          id: row.id,
          familyId: row.familyId,
          type: row.type,
          priority: row.priority,
          title: row.title,
          body: row.body,
          referenceType: row.referenceType,
          referenceId: row.referenceId,
          createdAt: row.createdAt.toISOString(),
        },
      }));
      return this.dispatcher.dispatch(deliveries);
    }

    const now = new Date().toISOString();
    const deliveries: NotificationDelivery[] = data.userIds.map((userId) => ({
      userId,
      memberId: null,
      notification: {
        id: null,
        familyId: data.payload.familyId,
        type: data.payload.type,
        priority: data.payload.priority,
        title: data.payload.title,
        body: data.payload.body,
        referenceType: data.payload.referenceType ?? null,
        referenceId: data.payload.referenceId ?? null,
        createdAt: now,
      },
    }));
    return this.dispatcher.dispatch(deliveries);
  }
}
