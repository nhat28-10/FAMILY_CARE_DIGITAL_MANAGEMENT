import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CalendarEventStatus,
  EventResponseStatus,
  MemberStatus,
  NotificationPriority,
  NotificationType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FEATURE_ACCESS_KEYS } from '../subscriptions/feature-access.constants';
import { FeatureAccessService } from '../subscriptions/feature-access.service';
import { FeatureNotAvailableException } from '../subscriptions/feature-not-available.exception';
import { CalendarEventQueryDto } from './dto/calendar-event-query.dto';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { RespondCalendarEventDto } from './dto/respond-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { UpdateCalendarReminderDto } from './dto/update-calendar-reminder.dto';

const calendarEventInclude = {
  createdByMember: {
    include: {
      user: {
        select: { id: true, email: true, fullName: true, avatarUrl: true },
      },
    },
  },
  participants: {
    include: {
      member: {
        include: {
          user: {
            select: { id: true, email: true, fullName: true, avatarUrl: true },
          },
        },
      },
    },
    orderBy: { id: 'asc' as const },
  },
} satisfies Prisma.CalendarEventInclude;

type CalendarEventPayload = Prisma.CalendarEventGetPayload<{
  include: typeof calendarEventInclude;
}>;

type CalendarEventParticipantPayload =
  CalendarEventPayload['participants'][number];

type CalendarEventResponse = CalendarEventPayload & {
  myParticipant: CalendarEventParticipantPayload | null;
  myResponseStatus: EventResponseStatus | null;
};

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly featureAccessService: FeatureAccessService,
  ) {}

  async createEvent(
    familyId: string,
    createdByMemberId: string,
    dto: CreateCalendarEventDto,
  ) {
    await this.assertFeature(familyId, FEATURE_ACCESS_KEYS.CALENDAR_EVENTS);
    const startTime = new Date(dto.startTime);
    const endTime = dto.endTime ? new Date(dto.endTime) : null;
    this.assertValidEventTime(startTime, endTime);
    await this.assertOptionalFeatures(familyId, dto);

    const participantIds = await this.resolveParticipantIds(
      familyId,
      dto.participantMemberIds,
    );
    const reminderEnabled = dto.reminderEnabled ?? false;

    const event = await this.prisma.$transaction(async (tx) => {
      const created = await tx.calendarEvent.create({
        data: {
          workspaceId: familyId,
          title: dto.title,
          description: dto.description ?? null,
          location: dto.location ?? null,
          startTime,
          endTime,
          isRecurring: dto.isRecurring ?? false,
          createdByMemberId,
        },
      });

      await tx.calendarEventParticipant.createMany({
        data: participantIds.map((memberId) => ({
          eventId: created.id,
          memberId,
          reminderEnabled,
        })),
      });

      return tx.calendarEvent.findUniqueOrThrow({
        where: { id: created.id },
        include: calendarEventInclude,
      });
    });

    await this.notificationsService.notify(familyId, participantIds, {
      type: NotificationType.CALENDAR,
      priority: NotificationPriority.NORMAL,
      title: 'Sự kiện lịch mới',
      body: event.title,
      referenceType: 'CALENDAR_EVENT',
      referenceId: event.id,
    });

    return this.withMyParticipation(event, createdByMemberId);
  }

  async listEvents(
    familyId: string,
    currentMemberId: string,
    query: CalendarEventQueryDto,
  ) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && to <= from) {
      throw new BadRequestException(
        'Thời gian kết thúc lọc phải sau thời gian bắt đầu',
      );
    }

    const where: Prisma.CalendarEventWhereInput = {
      workspaceId: familyId,
      ...(query.status ? { status: query.status } : {}),
      ...(from || to
        ? {
            startTime: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const events = await this.prisma.calendarEvent.findMany({
      where,
      include: calendarEventInclude,
      orderBy: { startTime: 'asc' },
    });

    return events.map((event) =>
      this.withMyParticipation(event, currentMemberId),
    );
  }

  async getEvent(familyId: string, eventId: string, currentMemberId: string) {
    const event = await this.findEventOrThrow(familyId, eventId);
    return this.withMyParticipation(event, currentMemberId);
  }

  async updateEvent(
    familyId: string,
    eventId: string,
    currentMemberId: string,
    dto: UpdateCalendarEventDto,
  ) {
    await this.findEventOrThrow(familyId, eventId);

    const startTime = dto.startTime ? new Date(dto.startTime) : undefined;
    const endTime =
      dto.endTime === undefined
        ? undefined
        : dto.endTime
          ? new Date(dto.endTime)
          : null;
    if (startTime || endTime !== undefined) {
      const current = await this.prisma.calendarEvent.findUniqueOrThrow({
        where: { id: eventId },
        select: { startTime: true, endTime: true },
      });
      this.assertValidEventTime(
        startTime ?? current.startTime,
        endTime !== undefined ? endTime : current.endTime,
      );
    }
    await this.assertOptionalFeatures(familyId, dto);

    const participantIds =
      dto.participantMemberIds !== undefined
        ? await this.resolveParticipantIds(familyId, dto.participantMemberIds)
        : undefined;

    const event = await this.prisma.$transaction(async (tx) => {
      await tx.calendarEvent.update({
        where: { id: eventId },
        data: {
          title: dto.title,
          description: dto.description,
          location: dto.location,
          startTime,
          endTime,
          isRecurring: dto.isRecurring,
        },
      });

      if (participantIds) {
        await tx.calendarEventParticipant.deleteMany({ where: { eventId } });
        await tx.calendarEventParticipant.createMany({
          data: participantIds.map((memberId) => ({
            eventId,
            memberId,
            reminderEnabled: dto.reminderEnabled ?? false,
          })),
        });
      }

      return tx.calendarEvent.findUniqueOrThrow({
        where: { id: eventId },
        include: calendarEventInclude,
      });
    });

    return this.withMyParticipation(event, currentMemberId);
  }

  async cancelEvent(
    familyId: string,
    eventId: string,
    currentMemberId: string,
  ) {
    await this.findEventOrThrow(familyId, eventId);
    const event = await this.prisma.calendarEvent.update({
      where: { id: eventId },
      data: { status: CalendarEventStatus.CANCELED },
      include: calendarEventInclude,
    });

    return this.withMyParticipation(event, currentMemberId);
  }

  async respondToEvent(
    familyId: string,
    eventId: string,
    memberId: string,
    dto: RespondCalendarEventDto,
  ) {
    await this.findEventOrThrow(familyId, eventId);
    await this.findParticipantOrThrow(eventId, memberId);

    const participant = await this.prisma.calendarEventParticipant.update({
      where: { eventId_memberId: { eventId, memberId } },
      data: { responseStatus: dto.responseStatus },
      include: {
        event: { include: calendarEventInclude },
        member: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    return this.withMyParticipation(participant.event, memberId);
  }

  async updateReminder(
    familyId: string,
    eventId: string,
    memberId: string,
    dto: UpdateCalendarReminderDto,
  ) {
    await this.findEventOrThrow(familyId, eventId);
    await this.findParticipantOrThrow(eventId, memberId);

    const participant = await this.prisma.calendarEventParticipant.update({
      where: { eventId_memberId: { eventId, memberId } },
      data: {
        reminderEnabled: dto.reminderEnabled,
        reminderSentAt: dto.reminderEnabled ? null : undefined,
      },
      include: { event: { include: calendarEventInclude } },
    });

    return this.withMyParticipation(participant.event, memberId);
  }

  private async findEventOrThrow(familyId: string, eventId: string) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, workspaceId: familyId },
      include: calendarEventInclude,
    });
    if (!event) {
      throw new NotFoundException('Không tìm thấy sự kiện lịch');
    }
    return event;
  }

  private async findParticipantOrThrow(eventId: string, memberId: string) {
    const participant = await this.prisma.calendarEventParticipant.findUnique({
      where: { eventId_memberId: { eventId, memberId } },
    });
    if (!participant) {
      throw new ForbiddenException('Bạn không phải người tham gia sự kiện này');
    }
    return participant;
  }

  private withMyParticipation(
    event: CalendarEventPayload,
    currentMemberId: string,
  ): CalendarEventResponse {
    const myParticipant =
      event.participants.find(
        (participant) => participant.memberId === currentMemberId,
      ) ?? null;

    return {
      ...event,
      myParticipant,
      myResponseStatus: myParticipant?.responseStatus ?? null,
    };
  }

  private async resolveParticipantIds(
    familyId: string,
    requestedIds?: string[],
  ): Promise<string[]> {
    if (requestedIds && requestedIds.length === 0) {
      throw new BadRequestException('Sự kiện cần ít nhất một người tham gia');
    }

    const members = await this.prisma.familyMember.findMany({
      where: {
        familyId,
        status: MemberStatus.ACTIVE,
        ...(requestedIds ? { id: { in: requestedIds } } : {}),
      },
      select: { id: true },
      orderBy: { joinedAt: 'asc' },
    });
    if (requestedIds && members.length !== requestedIds.length) {
      throw new BadRequestException(
        'Danh sách người tham gia chứa thành viên không hợp lệ',
      );
    }
    if (members.length === 0) {
      throw new BadRequestException('Sự kiện cần ít nhất một người tham gia');
    }
    return members.map((member) => member.id);
  }

  private assertValidEventTime(startTime: Date, endTime: Date | null): void {
    if (Number.isNaN(startTime.getTime())) {
      throw new BadRequestException('Thời gian bắt đầu không hợp lệ');
    }
    if (endTime && Number.isNaN(endTime.getTime())) {
      throw new BadRequestException('Thời gian kết thúc không hợp lệ');
    }
    if (endTime && endTime <= startTime) {
      throw new BadRequestException(
        'Thời gian kết thúc phải sau thời gian bắt đầu',
      );
    }
  }

  private async assertOptionalFeatures(
    familyId: string,
    dto: Pick<CreateCalendarEventDto, 'isRecurring' | 'reminderEnabled'>,
  ): Promise<void> {
    if (dto.isRecurring) {
      await this.assertFeature(
        familyId,
        FEATURE_ACCESS_KEYS.CALENDAR_RECURRING_EVENTS,
      );
    }
    if (dto.reminderEnabled) {
      await this.assertFeature(
        familyId,
        FEATURE_ACCESS_KEYS.CALENDAR_REMINDERS,
      );
    }
  }

  private async assertFeature(
    familyId: string,
    feature: string,
  ): Promise<void> {
    const result = await this.featureAccessService.canUseFeatures(familyId, [
      feature,
    ]);
    if (!result.allowed) {
      throw new FeatureNotAvailableException(
        result.missingFeature ?? feature,
        result.message,
      );
    }
  }
}
