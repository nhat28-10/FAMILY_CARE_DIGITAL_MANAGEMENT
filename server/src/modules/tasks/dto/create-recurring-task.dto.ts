import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  IsEnum,
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { TaskScheduleDto } from './task-schedule.dto';

const trimString = ({ value }: TransformFnParams): unknown => {
  const candidate: unknown = value;
  return typeof candidate === 'string' ? candidate.trim() : candidate;
};

export class CreateRecurringTaskDto {
  @ApiProperty({
    example: 'Dọn phòng khách',
    description: 'Tiêu đề công việc lặp lại cần tạo',
  })
  @Transform(trimString)
  @IsString({ message: 'Tên công việc phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên công việc không được để trống' })
  @MaxLength(150, {
    message: 'Tên công việc không được vượt quá 150 ký tự',
  })
  title!: string;

  @ApiPropertyOptional({
    example: 'Dọn phòng khách mỗi tuần',
    description: 'Mô tả chi tiết công việc lặp lại',
  })
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: 'Mô tả công việc phải là chuỗi' })
  @MaxLength(1000, {
    message: 'Mô tả công việc không được vượt quá 1000 ký tự',
  })
  description?: string;

  @ApiPropertyOptional({
    example: '8a97813a-44c2-4028-8d9f-9bbf1cf9b44a',
    description: 'ID danh mục công việc thuộc cùng gia đình',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Danh mục công việc không hợp lệ' })
  taskCategoryId?: string;

  @ApiPropertyOptional({
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
    description: 'Mức độ ưu tiên của công việc',
  })
  @IsOptional()
  @IsEnum(TaskPriority, { message: 'Mức độ ưu tiên không hợp lệ' })
  priority?: TaskPriority;

  @ApiPropertyOptional({
    enum: TaskStatus,
    default: TaskStatus.ACTIVE,
    description: 'Trạng thái ban đầu của công việc',
  })
  @IsOptional()
  @IsEnum(TaskStatus, { message: 'Trạng thái công việc không hợp lệ' })
  status?: TaskStatus;

  @ApiProperty({
    type: TaskScheduleDto,
    description: 'Lịch lặp của công việc',
  })
  @IsDefined({ message: 'Lịch lặp công việc không được để trống' })
  @ValidateNested()
  @Type(() => TaskScheduleDto)
  schedule!: TaskScheduleDto;
}
