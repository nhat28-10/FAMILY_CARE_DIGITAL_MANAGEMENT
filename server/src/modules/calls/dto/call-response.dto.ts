import { ApiProperty } from '@nestjs/swagger';
import { CallParticipantStatus, CallStatus, FamilyRole } from '@prisma/client';

export class CallMemberUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true })
  fullName!: string | null;

  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true })
  avatarUrl!: string | null;
}

export class CallMemberResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true })
  displayName!: string | null;

  @ApiProperty({ enum: FamilyRole, enumName: 'FamilyRole' })
  familyRole!: FamilyRole;

  @ApiProperty({ type: () => CallMemberUserResponseDto })
  user!: CallMemberUserResponseDto;
}

export class CallParticipantResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  callId!: string;

  @ApiProperty({ format: 'uuid' })
  memberId!: string;

  @ApiProperty({
    enum: CallParticipantStatus,
    enumName: 'CallParticipantStatus',
  })
  status!: CallParticipantStatus;

  @ApiProperty({ format: 'date-time' })
  invitedAt!: Date;

  @ApiProperty({ format: 'date-time', nullable: true })
  joinedAt!: Date | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  leftAt!: Date | null;

  @ApiProperty({ type: () => CallMemberResponseDto })
  member!: CallMemberResponseDto;
}

export class CallResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  conversationId!: string;

  @ApiProperty({ format: 'uuid' })
  initiatedByMemberId!: string;

  @ApiProperty({ example: 'call-3f1e...' })
  roomName!: string;

  @ApiProperty({ enum: CallStatus, enumName: 'CallStatus' })
  status!: CallStatus;

  @ApiProperty({ format: 'date-time' })
  startedAt!: Date;

  @ApiProperty({ format: 'date-time', nullable: true })
  connectedAt!: Date | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  endedAt!: Date | null;

  @ApiProperty({
    nullable: true,
    enum: ['hangup', 'timeout', 'all_left', 'declined'],
    description:
      'Lý do kết thúc — chỉ set khi status không còn RINGING/ONGOING.',
  })
  endedReason!: string | null;

  @ApiProperty({ type: () => CallMemberResponseDto })
  initiatedByMember!: CallMemberResponseDto;

  @ApiProperty({ type: () => CallParticipantResponseDto, isArray: true })
  participants!: CallParticipantResponseDto[];
}

export class InitiateCallResponseDto {
  @ApiProperty({ format: 'uuid' })
  callId!: string;

  @ApiProperty({ example: 'call-3f1e...' })
  roomName!: string;

  @ApiProperty({ description: 'LiveKit access token (JWT), TTL 10 phút' })
  token!: string;

  @ApiProperty({ example: 'wss://family-care-xxxxx.livekit.cloud' })
  livekitUrl!: string;

  @ApiProperty({ type: () => CallResponseDto })
  call!: CallResponseDto;
}

export class JoinCallResponseDto {
  @ApiProperty({ format: 'uuid' })
  callId!: string;

  @ApiProperty({ example: 'call-3f1e...' })
  roomName!: string;

  @ApiProperty({ description: 'LiveKit access token (JWT), TTL 10 phút' })
  token!: string;

  @ApiProperty({ example: 'wss://family-care-xxxxx.livekit.cloud' })
  livekitUrl!: string;
}

export class CallActionResponseDto {
  @ApiProperty({ format: 'uuid' })
  callId!: string;

  @ApiProperty({ enum: CallStatus, enumName: 'CallStatus' })
  status!: CallStatus;
}

export class CallHistoryResponseDto {
  @ApiProperty({ type: () => CallResponseDto, isArray: true })
  items!: CallResponseDto[];

  @ApiProperty({ nullable: true, format: 'uuid' })
  nextCursor!: string | null;
}
