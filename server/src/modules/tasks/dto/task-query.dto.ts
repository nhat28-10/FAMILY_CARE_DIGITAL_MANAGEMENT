import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority, TaskStatus, TaskType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class TaskQueryDto {
  @ApiPropertyOptional({
    enum: TaskStatus,
    description: 'Lọc công việc theo trạng thái',
  })
  @IsOptional()
  @IsEnum(TaskStatus, { message: 'Trạng thái công việc không hợp lệ' })
  status?: TaskStatus;

  @ApiPropertyOptional({
    example: '8a97813a-44c2-4028-8d9f-9bbf1cf9b44a',
    description: 'Lọc công việc theo danh mục',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Danh mục công việc không hợp lệ' })
  taskCategoryId?: string;

  @ApiPropertyOptional({
    enum: TaskPriority,
    description: 'Lọc công việc theo mức độ ưu tiên',
  })
  @IsOptional()
  @IsEnum(TaskPriority, { message: 'Mức độ ưu tiên không hợp lệ' })
  priority?: TaskPriority;

  @ApiPropertyOptional({
    enum: TaskType,
    description: 'Lọc công việc theo loại công việc',
  })
  @IsOptional()
  @IsEnum(TaskType, { message: 'Loại công việc không hợp lệ' })
  taskType?: TaskType;
}
