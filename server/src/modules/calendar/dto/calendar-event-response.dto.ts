import { ApiProperty } from '@nestjs/swagger';
import {
  CalendarEventStatus,
  EventResponseStatus,
  FamilyRole,
  MemberStatus,
} from '@prisma/client';

class CalendarEventUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'member@example.com' })
  email!: string;

  @ApiProperty({ example: 'Nguyen Van A', nullable: true })
  fullName!: string | null;

  @ApiProperty({ example: 'https://example.com/avatar.jpg', nullable: true })
  avatarUrl!: string | null;
}

class CalendarEventMemberResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ enum: FamilyRole })
  familyRole!: FamilyRole;

  @ApiProperty({ enum: MemberStatus })
  status!: MemberStatus;

  @ApiProperty({ type: () => CalendarEventUserResponseDto })
  user!: CalendarEventUserResponseDto;
}

class CalendarEventParticipantResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  eventId!: string;

  @ApiProperty({ format: 'uuid' })
  memberId!: string;

  @ApiProperty({ enum: EventResponseStatus })
  responseStatus!: EventResponseStatus;

  @ApiProperty()
  reminderEnabled!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  reminderSentAt!: string | null;

  @ApiProperty({ type: () => CalendarEventMemberResponseDto })
  member!: CalendarEventMemberResponseDto;
}

export class CalendarEventResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  workspaceId!: string;

  @ApiProperty({ example: 'Family dinner' })
  title!: string;

  @ApiProperty({ example: 'Meet at home', nullable: true })
  description!: string | null;

  @ApiProperty({ example: 'Home', nullable: true })
  location!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  startTime!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  endTime!: string | null;

  @ApiProperty()
  isRecurring!: boolean;

  @ApiProperty({ format: 'uuid' })
  createdByMemberId!: string;

  @ApiProperty({ enum: CalendarEventStatus })
  status!: CalendarEventStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: () => CalendarEventMemberResponseDto })
  createdByMember!: CalendarEventMemberResponseDto;

  @ApiProperty({ type: () => [CalendarEventParticipantResponseDto] })
  participants!: CalendarEventParticipantResponseDto[];

  @ApiProperty({
    enum: EventResponseStatus,
    nullable: true,
    example: EventResponseStatus.ACCEPTED,
    description:
      'Response status of the authenticated family member for this event. Null means the member is not a participant.',
  })
  myResponseStatus!: EventResponseStatus | null;

  @ApiProperty({
    type: () => CalendarEventParticipantResponseDto,
    nullable: true,
    description:
      'Participant row of the authenticated family member. Null means the member is not a participant.',
  })
  myParticipant!: CalendarEventParticipantResponseDto | null;
}

export class CalendarEventApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Lay chi tiet su kien lich thanh cong' })
  message!: string;

  @ApiProperty({ type: () => CalendarEventResponseDto })
  data!: CalendarEventResponseDto;
}

export class CalendarEventListApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Lay danh sach su kien lich thanh cong' })
  message!: string;

  @ApiProperty({ type: () => [CalendarEventResponseDto] })
  data!: CalendarEventResponseDto[];
}
