import { ApiProperty } from '@nestjs/swagger';
import { NotificationPriority, NotificationType } from '@prisma/client';

export class NotificationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  familyId!: string;

  @ApiProperty({ format: 'uuid' })
  recipientMemberId!: string;

  @ApiProperty({ enum: NotificationType, enumName: 'NotificationType' })
  type!: NotificationType;

  @ApiProperty({
    enum: NotificationPriority,
    enumName: 'NotificationPriority',
  })
  priority!: NotificationPriority;

  @ApiProperty({ example: 'Cảnh báo SOS' })
  title!: string;

  @ApiProperty({ example: 'Một thành viên đã kích hoạt SOS' })
  body!: string;

  @ApiProperty({
    nullable: true,
    enum: [
      'SOS_ALERT',
      'ALBUM_MEDIA',
      'JOIN_REQUEST',
      'FAMILY',
      'FAMILY_MEMBER',
      'TASK_ASSIGNMENT',
      'CALENDAR_EVENT',
      'BUDGET_ALERT',
      'FINANCIAL_GOAL',
      'CONVERSATION',
      'SUPPORT_REQUEST',
    ],
  })
  referenceType!: string | null;

  @ApiProperty({ nullable: true, format: 'uuid' })
  referenceId!: string | null;

  @ApiProperty({ example: false })
  isRead!: boolean;

  @ApiProperty({ nullable: true, format: 'date-time' })
  readAt!: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class NotificationListApiResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ example: 'Lấy danh sách thông báo thành công' })
  message!: string;

  @ApiProperty({ type: () => [NotificationResponseDto] })
  data!: NotificationResponseDto[];
}

export class NotificationItemApiResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ example: 'Đã đánh dấu thông báo là đã đọc' })
  message!: string;

  @ApiProperty({ type: () => NotificationResponseDto })
  data!: NotificationResponseDto;
}

class NotificationUnreadCountResponseDto {
  @ApiProperty({ example: 3 })
  count!: number;
}

export class NotificationUnreadCountApiResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ example: 'Lấy số thông báo chưa đọc thành công' })
  message!: string;

  @ApiProperty({ type: () => NotificationUnreadCountResponseDto })
  data!: NotificationUnreadCountResponseDto;
}
