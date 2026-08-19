import {
  CalendarEventStatus,
  EventResponseStatus,
  FamilyRole,
  MemberStatus,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FeatureAccessService } from '../subscriptions/feature-access.service';
import { CalendarService } from './calendar.service';

describe('CalendarService event responses', () => {
  const familyId = 'family-id';
  const eventId = 'event-id';
  const memberId = 'member-id';

  let prisma: {
    calendarEvent: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    calendarEventParticipant: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: CalendarService;

  const member = (id: string) => ({
    id,
    userId: `${id}-user`,
    familyId,
    familyRole: FamilyRole.FAMILY_MEMBER,
    status: MemberStatus.ACTIVE,
    joinedAt: new Date('2026-08-01T00:00:00.000Z'),
    displayName: `${id} name`,
    relationship: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    user: {
      id: `${id}-user`,
      email: `${id}@example.com`,
      fullName: `${id} name`,
      avatarUrl: null,
    },
  });

  const participant = (id: string, responseStatus: EventResponseStatus) => ({
    id: `${id}-participant`,
    eventId,
    memberId: id,
    responseStatus,
    reminderEnabled: true,
    reminderSentAt: null,
    member: member(id),
  });

  const event = (responseStatus: EventResponseStatus) => ({
    id: eventId,
    workspaceId: familyId,
    title: 'Family dinner',
    description: null,
    location: null,
    startTime: new Date('2026-08-19T12:00:00.000Z'),
    endTime: null,
    isRecurring: false,
    createdByMemberId: memberId,
    status: CalendarEventStatus.ACTIVE,
    createdAt: new Date('2026-08-18T12:00:00.000Z'),
    createdByMember: member(memberId),
    participants: [
      participant('other-member-id', EventResponseStatus.INVITED),
      participant(memberId, responseStatus),
    ],
  });

  beforeEach(() => {
    prisma = {
      calendarEvent: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      calendarEventParticipant: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new CalendarService(
      prisma as unknown as PrismaService,
      {
        notify: jest.fn().mockResolvedValue({ ids: [] }),
      } as unknown as NotificationsService,
      {
        canUseFeatures: jest.fn().mockResolvedValue({ allowed: true }),
      } as unknown as FeatureAccessService,
    );
  });

  it('adds the current member response status to listed events', async () => {
    prisma.calendarEvent.findMany.mockResolvedValue([
      event(EventResponseStatus.ACCEPTED),
    ]);

    const result = await service.listEvents(familyId, memberId, {});

    expect(result[0]).toMatchObject({
      id: eventId,
      myResponseStatus: EventResponseStatus.ACCEPTED,
      myParticipant: {
        memberId,
        responseStatus: EventResponseStatus.ACCEPTED,
      },
    });
  });

  it('returns the updated event after responding', async () => {
    prisma.calendarEvent.findFirst.mockResolvedValue(
      event(EventResponseStatus.INVITED),
    );
    prisma.calendarEventParticipant.findUnique.mockResolvedValue({
      id: `${memberId}-participant`,
    });
    prisma.calendarEventParticipant.update.mockResolvedValue({
      ...participant(memberId, EventResponseStatus.DECLINED),
      event: event(EventResponseStatus.DECLINED),
    });

    const result = await service.respondToEvent(familyId, eventId, memberId, {
      responseStatus: EventResponseStatus.DECLINED,
    });

    expect(result).toMatchObject({
      id: eventId,
      myResponseStatus: EventResponseStatus.DECLINED,
      myParticipant: {
        memberId,
        responseStatus: EventResponseStatus.DECLINED,
      },
    });
    expect('event' in result).toBe(false);
  });
});
