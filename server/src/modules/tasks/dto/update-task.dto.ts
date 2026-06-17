import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority, TaskStatus, TaskType } from '@prisma/client';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const trimString = ({ value }: TransformFnParams): unknown => {
  const candidate: unknown = value;
  return typeof candidate === 'string' ? candidate.trim() : candidate;
};

export class UpdateTaskDto {
  @ApiPropertyOptional({
    example: 'Rửa chén',
    description: 'Tiêu đề mới của công việc',
  })
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: 'Tên công việc phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên công việc không được để trống' })
  @MaxLength(150, { message: 'Tên công việc không được vượt quá 150 ký tự' })
  title?: string;

  @ApiPropertyOptional({
    example: 'Rửa chén sau bữa tối',
    description: 'Mô tả mới của công việc',
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
    enum: TaskType,
    description: 'Loại công việc; Phase 1 không hỗ trợ chuyển sang RECURRING',
  })
  @IsOptional()
  @IsEnum(TaskType, { message: 'Loại công việc không hợp lệ' })
  taskType?: TaskType;

  @ApiPropertyOptional({
    enum: TaskPriority,
    description: 'Mức độ ưu tiên mới của công việc',
  })
  @IsOptional()
  @IsEnum(TaskPriority, { message: 'Mức độ ưu tiên không hợp lệ' })
  priority?: TaskPriority;

  @ApiPropertyOptional({
    enum: TaskStatus,
    description: 'Trạng thái mới của công việc',
  })
  @IsOptional()
  @IsEnum(TaskStatus, { message: 'Trạng thái công việc không hợp lệ' })
  status?: TaskStatus;

  @ApiPropertyOptional({
    example: '2026-06-30T12:00:00.000Z',
    description: 'Hạn hoàn thành mới của công việc',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Hạn hoàn thành phải là ngày hợp lệ' })
  dueAt?: string;
}
