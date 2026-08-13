import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskCategoryStatus } from '@prisma/client';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const trimString = ({ value }: TransformFnParams): unknown => {
  const candidate: unknown = value;
  return typeof candidate === 'string' ? candidate.trim() : candidate;
};

export class UpdateTaskCategoryDto {
  @ApiPropertyOptional({
    example: 'Việc nhà',
    description: 'Tên mới của danh mục công việc',
  })
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: 'Tên danh mục công việc phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên danh mục công việc không được để trống' })
  @MaxLength(100, {
    message: 'Tên danh mục công việc không được vượt quá 100 ký tự',
  })
  name?: string;

  @ApiPropertyOptional({
    example: 'Các công việc sinh hoạt hằng ngày',
    description: 'Mô tả mới của danh mục công việc',
  })
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: 'Mô tả danh mục công việc phải là chuỗi' })
  @MaxLength(500, {
    message: 'Mô tả danh mục công việc không được vượt quá 500 ký tự',
  })
  description?: string;

  @ApiPropertyOptional({
    enum: TaskCategoryStatus,
    description: 'Trạng thái hoạt động của danh mục công việc',
  })
  @IsOptional()
  @IsEnum(TaskCategoryStatus, {
    message: 'Trạng thái danh mục công việc không hợp lệ',
  })
  status?: TaskCategoryStatus;
}
