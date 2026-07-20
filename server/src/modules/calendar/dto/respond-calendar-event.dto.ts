import { ApiProperty } from '@nestjs/swagger';
import { EventResponseStatus } from '@prisma/client';
import { IsIn } from 'class-validator';

const ALLOWED_EVENT_RESPONSES = [
  EventResponseStatus.ACCEPTED,
  EventResponseStatus.DECLINED,
  EventResponseStatus.MAYBE,
] as const;

export class RespondCalendarEventDto {
  @ApiProperty({ enum: ALLOWED_EVENT_RESPONSES })
  @IsIn(ALLOWED_EVENT_RESPONSES)
  responseStatus!: (typeof ALLOWED_EVENT_RESPONSES)[number];
}
