import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import {
  CalendarEventStatus,
  NotificationPriority,
  NotificationType,
  TaskAssignmentStatus,
} from '@prisma/client';
import type { Queue } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { NOTIFICATIONS_QUEUE, REMINDER_SCAN_JOB } from './notifications.types';

const REMINDER_WINDOW_MS = 30 * 60_000; // nhắc trước 30 phút
const SCAN_INTERVAL_MS = 5 * 60_000; // quét 5 phút/lần

/**
 * Quét task/sự kiện sắp đến hạn và bắn notification nhắc. Idempotent nhờ cột
 * `reminderSentAt` (chỉ lấy row chưa đóng dấu). Chạy bằng BullMQ repeatable
 * job nên an toàn khi nhiều instance (BullMQ tự lock).
 */
@Injectable()
export class RemindersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        REMINDER_SCAN_JOB,
        { every: SCAN_INTERVAL_MS },
        { name: REMINDER_SCAN_JOB },
      );
    } catch (err) {
      this.logger.error(
        `Không thể đăng ký reminder scheduler: ${(err as Error).message}`,
      );
    }
  }

  async scan(): Promise<void> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS);
    await this.scanTaskAssignments(now, windowEnd);
    await this.scanCalendarEvents(now, windowEnd);
  }

  private async scanTaskAssignments(now: Date, windowEnd: Date): Promise<void> {
    const due = await this.prisma.taskAssignment.findMany({
      where: {
        reminderSentAt: null,
        dueAt: { gt: now, lte: windowEnd },
        status: {
          in: [TaskAssignmentStatus.ASSIGNED, TaskAssignmentStatus.IN_PROGRESS],
        },
      },
      select: {
        id: true,
        assignedToMemberId: true,
        dueAt: true,
        task: { select: { familyId: true, title: true } },
      },
    });
    // Per-row: notify rồi đóng dấu NGAY từng row. Nếu gom updateMany sau vòng
    // lặp, notify lỗi giữa chừng → row đã nhắc không được đóng dấu → BullMQ
    // retry bắn nhắc trùng. 1 row lỗi không chặn row khác, không fail job.
    for (const assignment of due) {
      try {
        await this.notificationsService.notify(
          assignment.task.familyId,
          [assignment.assignedToMemberId],
          {
            type: NotificationType.TASK,
            priority: NotificationPriority.HIGH,
            title: 'Công việc sắp đến hạn',
            body: `Công việc "${assignment.task.title}" sẽ đến hạn trong 30 phút tới.`,
            referenceType: 'TASK_ASSIGNMENT',
            referenceId: assignment.id,
          },
        );
        await this.prisma.taskAssignment.update({
          where: { id: assignment.id },
          data: { reminderSentAt: new Date() },
        });
      } catch (err) {
        this.logger.error(
          `Không thể gửi nhắc hạn cho task assignment ${assignment.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async scanCalendarEvents(now: Date, windowEnd: Date): Promise<void> {
    const upcoming = await this.prisma.calendarEventParticipant.findMany({
      where: {
        reminderSentAt: null,
        reminderEnabled: true,
        event: {
          status: CalendarEventStatus.ACTIVE,
          startTime: { gt: now, lte: windowEnd },
        },
      },
      select: {
        id: true,
        memberId: true,
        event: { select: { id: true, workspaceId: true, title: true } },
      },
    });
    // Per-row như scanTaskAssignments — giữ idempotency khi notify lỗi giữa chừng.
    for (const participant of upcoming) {
      try {
        await this.notificationsService.notify(
          participant.event.workspaceId,
          [participant.memberId],
          {
            type: NotificationType.CALENDAR,
            priority: NotificationPriority.HIGH,
            title: 'Sự kiện sắp diễn ra',
            body: `Sự kiện "${participant.event.title}" sẽ bắt đầu trong 30 phút tới.`,
            referenceType: 'CALENDAR_EVENT',
            referenceId: participant.event.id,
          },
        );
        await this.prisma.calendarEventParticipant.update({
          where: { id: participant.id },
          data: { reminderSentAt: new Date() },
        });
      } catch (err) {
        this.logger.error(
          `Không thể gửi nhắc sự kiện cho participant ${participant.id}: ${(err as Error).message}`,
        );
      }
    }
  }
}
