import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateTaskDto {
  @ApiProperty({
    example: 'Rửa chén',
    description: 'Tiêu đề công việc cần tạo',
  })
  @Transform(trimString)
  @IsString({ message: 'Tên công việc phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên công việc không được để trống' })
  @MaxLength(150, { message: 'Tên công việc không được vượt quá 150 ký tự' })
  title!: string;

  @ApiPropertyOptional({
    example: 'Rửa chén sau bữa tối',
    description: 'Mô tả chi tiết công việc',
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
    default: TaskType.AD_HOC,
    description: 'Loại công việc; Phase 1 chỉ hỗ trợ AD_HOC',
  })
  @IsOptional()
  @IsEnum(TaskType, { message: 'Loại công việc không hợp lệ' })
  taskType?: TaskType;

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

  @ApiPropertyOptional({
    example: '2026-06-30T12:00:00.000Z',
    description: 'Hạn hoàn thành công việc',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Hạn hoàn thành phải là ngày hợp lệ' })
  dueAt?: string;
}
