import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FamilyRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentFamilyMember } from '../family-members/decorators/current-family-member.decorator';
import { FamilyRoles } from '../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../family-members/guards/family-permission.guard';
import { RequireFeature } from '../subscriptions/decorators/require-feature.decorator';
import { FEATURE_ACCESS_KEYS } from '../subscriptions/feature-access.constants';
import { FeatureAccessGuard } from '../subscriptions/guards/feature-access.guard';
import { CalendarService } from './calendar.service';
import { CalendarEventQueryDto } from './dto/calendar-event-query.dto';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { RespondCalendarEventDto } from './dto/respond-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { UpdateCalendarReminderDto } from './dto/update-calendar-reminder.dto';

const CALENDAR_MANAGER_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
] as const;

@ApiTags('Calendar - Lịch gia đình')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình cần truy cập lịch',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/calendar/events')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Post()
  @UseGuards(FeatureAccessGuard)
  @RequireFeature(FEATURE_ACCESS_KEYS.CALENDAR_EVENTS)
  @FamilyRoles(...CALENDAR_MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo sự kiện lịch thành công')
  @ApiOperation({ summary: 'Tạo sự kiện lịch gia đình' })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền hoặc gói không hỗ trợ',
  })
  createEvent(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateCalendarEventDto,
  ) {
    return this.calendarService.createEvent(familyId, memberId, dto);
  }

  @Get()
  @ResponseMessage('Lấy danh sách sự kiện lịch thành công')
  @ApiOperation({
    summary: 'Xem danh sách sự kiện lịch gia đình',
    description:
      'Active member được xem sự kiện lịch trong family. API view không bị khóa để dữ liệu cũ vẫn đọc được khi gói hết hạn.',
  })
  listEvents(
    @Param('familyId') familyId: string,
    @Query() query: CalendarEventQueryDto,
  ) {
    return this.calendarService.listEvents(familyId, query);
  }

  @Get(':eventId')
  @ResponseMessage('Lấy chi tiết sự kiện lịch thành công')
  @ApiOperation({ summary: 'Xem chi tiết sự kiện lịch gia đình' })
  @ApiParam({ name: 'eventId', description: 'ID sự kiện lịch', format: 'uuid' })
  getEvent(
    @Param('familyId') familyId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.calendarService.getEvent(familyId, eventId);
  }

  @Patch(':eventId')
  @UseGuards(FeatureAccessGuard)
  @RequireFeature(FEATURE_ACCESS_KEYS.CALENDAR_EVENTS)
  @FamilyRoles(...CALENDAR_MANAGER_ROLES)
  @ResponseMessage('Cập nhật sự kiện lịch thành công')
  @ApiOperation({ summary: 'Cập nhật sự kiện lịch gia đình' })
  @ApiParam({ name: 'eventId', description: 'ID sự kiện lịch', format: 'uuid' })
  updateEvent(
    @Param('familyId') familyId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.calendarService.updateEvent(familyId, eventId, dto);
  }

  @Patch(':eventId/cancel')
  @UseGuards(FeatureAccessGuard)
  @RequireFeature(FEATURE_ACCESS_KEYS.CALENDAR_EVENTS)
  @FamilyRoles(...CALENDAR_MANAGER_ROLES)
  @ResponseMessage('Hủy sự kiện lịch thành công')
  @ApiOperation({
    summary: 'Hủy sự kiện lịch gia đình',
    description: 'Không xóa cứng sự kiện; chỉ chuyển trạng thái sang CANCELED.',
  })
  @ApiParam({ name: 'eventId', description: 'ID sự kiện lịch', format: 'uuid' })
  cancelEvent(
    @Param('familyId') familyId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.calendarService.cancelEvent(familyId, eventId);
  }

  @Post(':eventId/respond')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Phản hồi sự kiện lịch thành công')
  @ApiOperation({ summary: 'Phản hồi tham gia sự kiện lịch' })
  @ApiParam({ name: 'eventId', description: 'ID sự kiện lịch', format: 'uuid' })
  respondToEvent(
    @Param('familyId') familyId: string,
    @Param('eventId') eventId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: RespondCalendarEventDto,
  ) {
    return this.calendarService.respondToEvent(
      familyId,
      eventId,
      memberId,
      dto,
    );
  }

  @Patch(':eventId/reminder')
  @UseGuards(FeatureAccessGuard)
  @RequireFeature(FEATURE_ACCESS_KEYS.CALENDAR_REMINDERS)
  @ResponseMessage('Cập nhật reminder sự kiện lịch thành công')
  @ApiOperation({ summary: 'Bật hoặc tắt reminder cá nhân cho sự kiện lịch' })
  @ApiParam({ name: 'eventId', description: 'ID sự kiện lịch', format: 'uuid' })
  updateReminder(
    @Param('familyId') familyId: string,
    @Param('eventId') eventId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: UpdateCalendarReminderDto,
  ) {
    return this.calendarService.updateReminder(
      familyId,
      eventId,
      memberId,
      dto,
    );
  }
}
