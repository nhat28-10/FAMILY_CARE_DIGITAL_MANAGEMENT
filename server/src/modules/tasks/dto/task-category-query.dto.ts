import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskCategoryStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class TaskCategoryQueryDto {
  @ApiPropertyOptional({
    enum: TaskCategoryStatus,
    description: 'Lọc danh mục công việc theo trạng thái',
  })
  @IsOptional()
  @IsEnum(TaskCategoryStatus, {
    message: 'Trạng thái danh mục công việc không hợp lệ',
  })
  status?: TaskCategoryStatus;
}
