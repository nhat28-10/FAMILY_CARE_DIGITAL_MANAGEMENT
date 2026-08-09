import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentFamilyMember } from '../family-members/decorators/current-family-member.decorator';
import { FamilyPermissionGuard } from '../family-members/guards/family-permission.guard';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import {
  NotificationItemApiResponseDto,
  NotificationListApiResponseDto,
  NotificationUnreadCountApiResponseDto,
} from './dto/notification-response.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@ApiParam({ name: 'familyId', description: 'ID của gia đình', format: 'uuid' })
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ResponseMessage('Lấy danh sách thông báo thành công')
  @ApiOperation({ summary: 'Danh sách thông báo của thành viên hiện tại' })
  @ApiOkResponse({ type: NotificationListApiResponseDto })
  list(
    @CurrentFamilyMember('id') memberId: string,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.listForMember(
      memberId,
      query.unreadOnly ?? false,
    );
  }

  @Patch('read-all')
  @ResponseMessage('Đã đánh dấu tất cả thông báo là đã đọc')
  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo của mình là đã đọc' })
  markAllRead(@CurrentFamilyMember('id') memberId: string) {
    return this.notificationsService.markAllRead(memberId);
  }

  @Get('unread-count')
  @ResponseMessage('Lấy số thông báo chưa đọc thành công')
  @ApiOperation({ summary: 'Số thông báo chưa đọc của thành viên hiện tại' })
  @ApiOkResponse({ type: NotificationUnreadCountApiResponseDto })
  unreadCount(@CurrentFamilyMember('id') memberId: string) {
    return this.notificationsService.unreadCount(memberId);
  }

  @Patch(':notificationId/read')
  @ResponseMessage('Đã đánh dấu thông báo là đã đọc')
  @ApiOperation({ summary: 'Đánh dấu một thông báo là đã đọc' })
  @ApiOkResponse({ type: NotificationItemApiResponseDto })
  markRead(
    @CurrentFamilyMember('id') memberId: string,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notificationsService.markRead(memberId, notificationId);
  }
}
