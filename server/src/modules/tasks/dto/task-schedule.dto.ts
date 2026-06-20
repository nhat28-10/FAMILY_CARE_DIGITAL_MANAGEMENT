import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskRepeatType, TaskScheduleStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class TaskScheduleDto {
  @ApiProperty({
    enum: TaskRepeatType,
    description: 'Kiểu lặp của công việc',
  })
  @IsEnum(TaskRepeatType, { message: 'Kiểu lặp công việc không hợp lệ' })
  repeatType!: TaskRepeatType;

  @ApiProperty({
    example: 1,
    minimum: 1,
    description: 'Khoảng cách giữa các lần lặp',
  })
  @Type(() => Number)
  @IsInt({ message: 'Khoảng lặp phải là số nguyên' })
  @Min(1, { message: 'Khoảng lặp phải lớn hơn 0' })
  repeatInterval!: number;

  @ApiProperty({
    example: '2026-06-18',
    description: 'Ngày bắt đầu lịch lặp',
  })
  @IsDateString({}, { message: 'Ngày bắt đầu lịch lặp phải là ngày hợp lệ' })
  startDate!: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Ngày kết thúc lịch lặp',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày kết thúc lịch lặp phải là ngày hợp lệ' })
  endDate?: string;

  @ApiPropertyOptional({
    example: 1,
    minimum: 1,
    maximum: 7,
    description: 'Thứ trong tuần theo ISO: 1 là Thứ hai, 7 là Chủ nhật',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Thứ trong tuần phải là số nguyên' })
  @Min(1, { message: 'Thứ trong tuần phải nằm trong khoảng 1 đến 7' })
  @Max(7, { message: 'Thứ trong tuần phải nằm trong khoảng 1 đến 7' })
  dayOfWeek?: number;

  @ApiPropertyOptional({
    enum: TaskScheduleStatus,
    default: TaskScheduleStatus.ACTIVE,
    description: 'Trạng thái lịch lặp',
  })
  @IsOptional()
  @IsEnum(TaskScheduleStatus, {
    message: 'Trạng thái lịch lặp không hợp lệ',
  })
  status?: TaskScheduleStatus;
}
