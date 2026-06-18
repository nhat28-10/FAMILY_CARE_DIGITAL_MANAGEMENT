import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationPriority, NotificationType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  /** Fan-out: one notification per recipient member (e.g. the whole workspace). */
  createForMembers(
    familyId: string,
    recipientMemberIds: string[],
    input: CreateNotificationInput,
  ) {
    if (recipientMemberIds.length === 0) {
      return Promise.resolve({ count: 0 });
    }

    return this.prisma.notification.createMany({
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
      where: { notificationId },
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

    return this.prisma.notification.update({
      where: { notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(memberId: string): Promise<null> {
    await this.prisma.notification.updateMany({
      where: { recipientMemberId: memberId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return null;
  }
}
