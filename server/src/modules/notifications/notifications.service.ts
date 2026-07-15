import { InjectQueue } from '@nestjs/bullmq';
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationPriority, NotificationType, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { DISPATCH_JOB, NOTIFICATIONS_QUEUE } from './notifications.types';
import type {
  DispatchJobData,
  EphemeralNotificationInput,
} from './notifications.types';

export interface CreateNotificationInput {
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  body: string;
  referenceType?: string | null;
  referenceId?: string | null;
}

/**
 * Shared in-app notifications. Other modules (SOS, ...) call `createForMembers`
 * to fan out a notification to a set of family members; recipients read/ack
 * their own notifications through the controller.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
    private readonly gateway: NotificationsGateway,
  ) {}

  /**
   * Persist notification (tx-aware) và enqueue dispatch realtime.
   * QUY ƯỚC: có `opts.tx` → CHỈ persist, caller tự gọi `dispatch(ids)` SAU khi
   * transaction commit (enqueue trong tx là bug: rollback vẫn đẩy noti "ma").
   */
  async notify(
    familyId: string,
    recipientMemberIds: string[],
    input: CreateNotificationInput,
    opts: { tx?: Prisma.TransactionClient } = {},
  ): Promise<{ ids: string[] }> {
    if (recipientMemberIds.length === 0) {
      return { ids: [] };
    }
    const client = opts.tx ?? this.prisma;
    const rows = await client.notification.createManyAndReturn({
      data: recipientMemberIds.map((recipientMemberId) => ({
        familyId,
        recipientMemberId,
        type: input.type,
        priority: input.priority ?? NotificationPriority.NORMAL,
        title: input.title,
        body: input.body,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
      })),
      select: { id: true },
    });
    const ids = rows.map((row) => row.id);
    if (!opts.tx) {
      await this.dispatch(ids);
    }
    return { ids };
  }

  /** Enqueue job đẩy realtime cho các notification ĐÃ persist. Nuốt lỗi Redis. */
  async dispatch(notificationIds: string[]): Promise<void> {
    if (notificationIds.length === 0) {
      return;
    }
    const data: DispatchJobData = { kind: 'persisted', notificationIds };
    try {
      await this.queue.add(DISPATCH_JOB, data);
    } catch (err) {
      this.logger.error(
        `Không thể enqueue dispatch notification: ${(err as Error).message}`,
      );
    }
  }

  /** Push-only (chat, reject join request): không persist, đẩy theo userIds. */
  async notifyUsersEphemeral(
    userIds: string[],
    payload: EphemeralNotificationInput,
  ): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    const data: DispatchJobData = { kind: 'ephemeral', userIds, payload };
    try {
      await this.queue.add(DISPATCH_JOB, data);
    } catch (err) {
      this.logger.error(
        `Không thể enqueue notification ephemeral: ${(err as Error).message}`,
      );
    }
  }

  async unreadCount(memberId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { recipientMemberId: memberId, isRead: false },
    });
    return { count };
  }

  /** Đẩy badge mới xuống client sau khi mark-read (best-effort). */
  private async pushUnreadCount(memberId: string): Promise<void> {
    try {
      const member = await this.prisma.familyMember.findUnique({
        where: { id: memberId },
        select: { userId: true, familyId: true },
      });
      if (!member) {
        return;
      }
      const { count } = await this.unreadCount(memberId);
      this.gateway.emitToUsers([member.userId], 'notification:unread-count', {
        familyId: member.familyId,
        count,
      });
    } catch (err) {
      this.logger.error(
        `Không thể đẩy unread-count: ${(err as Error).message}`,
      );
    }
  }

  /** Fan-out: one notification per recipient member (e.g. the whole workspace). */
  createForMembers(
    familyId: string,
    recipientMemberIds: string[],
    input: CreateNotificationInput,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (recipientMemberIds.length === 0) {
      return Promise.resolve({ count: 0 });
    }

    return client.notification.createMany({
      data: recipientMemberIds.map((recipientMemberId) => ({
        familyId,
        recipientMemberId,
        type: input.type,
        priority: input.priority ?? NotificationPriority.NORMAL,
        title: input.title,
        body: input.body,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
      })),
    });
  }

  listForMember(memberId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: {
        recipientMemberId: memberId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markRead(memberId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }
    if (notification.recipientMemberId !== memberId) {
      throw new ForbiddenException('Bạn không thể truy cập thông báo này');
    }
    if (notification.isRead) {
      return notification;
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
    await this.pushUnreadCount(memberId);
    return updated;
  }

  async markAllRead(memberId: string): Promise<null> {
    await this.prisma.notification.updateMany({
      where: { recipientMemberId: memberId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    await this.pushUnreadCount(memberId);
    return null;
  }
}
