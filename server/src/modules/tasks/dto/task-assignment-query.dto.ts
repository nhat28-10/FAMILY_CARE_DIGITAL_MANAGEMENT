import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskAssignmentStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class TaskAssignmentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: TaskAssignmentStatus,
    description: 'Lọc phân công công việc theo trạng thái',
  })
  @IsOptional()
  @IsEnum(TaskAssignmentStatus, {
    message: 'Trạng thái phân công không hợp lệ',
  })
  status?: TaskAssignmentStatus;
}
