import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean } from 'class-validator';

export class UpdateCalendarReminderDto {
  @ApiProperty({ example: true })
  @Type(() => Boolean)
  @IsBoolean()
  reminderEnabled!: boolean;
}
