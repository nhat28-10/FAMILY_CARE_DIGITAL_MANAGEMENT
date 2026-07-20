import { ApiPropertyOptional } from '@nestjs/swagger';
import { CalendarEventStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class CalendarEventQueryDto {
  @ApiPropertyOptional({ example: '2026-08-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: CalendarEventStatus })
  @IsOptional()
  @IsEnum(CalendarEventStatus)
  status?: CalendarEventStatus;
}
