import { Injectable } from '@nestjs/common';
import {
  AiRelatedModule,
  CalendarEventStatus,
  FamilyRole,
} from '@prisma/client';

import { CalendarService } from '../../calendar/calendar.service';
import { CalendarEventQueryDto } from '../../calendar/dto/calendar-event-query.dto';
import { CreateCalendarEventDto } from '../../calendar/dto/create-calendar-event.dto';
import { AiActionType } from '../types/ai-chatbot.types';
import type { AiToolDefinition, AiToolProvider } from './tool.types';
import { validateActionArgs } from './validate-action-args';

const ALL_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
  FamilyRole.FAMILY_MEMBER,
];

const CALENDAR_MANAGER_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
];

@Injectable()
export class CalendarAiTools implements AiToolProvider {
  constructor(private readonly calendarService: CalendarService) {}

  getTools(): AiToolDefinition[] {
    return [
      {
        name: 'list_calendar_events',
        description:
          'Danh sach su kien lich gia dinh theo khoang thoi gian. Dung khi nguoi dung hoi lich hom nay, ngay mai, tuan nay, hoac muon kiem tra truoc khi tao su kien moi.',
        parameters: {
          type: 'object',
          properties: {
            from: {
              type: 'string',
              description: 'Thoi gian bat dau loc dang ISO 8601 neu co',
            },
            to: {
              type: 'string',
              description: 'Thoi gian ket thuc loc dang ISO 8601 neu co',
            },
            status: {
              type: 'string',
              enum: Object.values(CalendarEventStatus),
              description: 'Trang thai su kien can loc',
            },
          },
          additionalProperties: false,
        },
        module: AiRelatedModule.CALENDAR,
        kind: 'read',
        allowedRoles: ALL_ROLES,
        execute: (args, ctx) =>
          this.calendarService.listEvents(
            ctx.familyId,
            validateActionArgs(CalendarEventQueryDto, args),
          ),
      },
      {
        name: 'propose_create_calendar_event',
        description:
          'DE XUAT tao su kien lich gia dinh moi (nguoi dung phai bam xac nhan moi tao that). Dung khi nguoi dung noi tao lich/hen lich/dat lich/nhac lich/su kien. participantMemberIds la tuy chon: chi dien khi da tra list_family_members va nguoi dung noi ro ai tham gia; neu khong, bo trong de moi tat ca thanh vien active.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              maxLength: 200,
              description: 'Ten su kien',
            },
            description: {
              type: 'string',
              maxLength: 2000,
              description: 'Mo ta hoac ghi chu neu co',
            },
            location: {
              type: 'string',
              maxLength: 255,
              description: 'Dia diem neu nguoi dung co noi',
            },
            startTime: {
              type: 'string',
              description:
                'Thoi gian bat dau dang ISO 8601 co timezone. Quy doi cac cum nhu "ngay mai", "toi nay" theo mui gio Viet Nam.',
            },
            endTime: {
              type: 'string',
              description:
                'Thoi gian ket thuc dang ISO 8601 neu nguoi dung co noi',
            },
            isRecurring: {
              type: 'boolean',
              description: 'true neu su kien lap lai',
            },
            participantMemberIds: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Danh sach UUID FamilyMember.id tham gia, lay tu list_family_members; bo trong neu moi tat ca thanh vien',
            },
            reminderEnabled: {
              type: 'boolean',
              description: 'true neu nguoi dung muon bat nhac lich',
            },
          },
          required: ['title', 'startTime'],
          additionalProperties: false,
        },
        module: AiRelatedModule.CALENDAR,
        kind: 'write',
        allowedRoles: CALENDAR_MANAGER_ROLES,
        actionType: AiActionType.CREATE_CALENDAR_EVENT,
        buildActionPayload: (args) => {
          const dto = validateActionArgs(CreateCalendarEventDto, args);
          return Promise.resolve({ ...dto });
        },
      },
    ];
  }
}
