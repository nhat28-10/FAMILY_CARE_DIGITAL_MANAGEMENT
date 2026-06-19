import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskAssignmentStatus, TaskPriority } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class MyTaskAssignmentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: TaskAssignmentStatus,
    description: 'Lọc công việc được giao theo trạng thái phân công',
  })
  @IsOptional()
  @IsEnum(TaskAssignmentStatus, {
    message: 'Trạng thái phân công không hợp lệ',
  })
  status?: TaskAssignmentStatus;

  @ApiPropertyOptional({
    enum: TaskPriority,
    description: 'Lọc công việc được giao theo mức độ ưu tiên của công việc',
  })
  @IsOptional()
  @IsEnum(TaskPriority, { message: 'Mức độ ưu tiên không hợp lệ' })
  priority?: TaskPriority;

  @ApiPropertyOptional({
    example: '2026-06-20T00:00:00.000Z',
    description: 'Lọc từ thời gian bắt đầu dự kiến',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Thời gian bắt đầu từ phải là ngày hợp lệ' })
  startFrom?: string;

  @ApiPropertyOptional({
    example: '2026-06-30T23:59:59.000Z',
    description: 'Lọc đến thời gian bắt đầu dự kiến',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Thời gian bắt đầu đến phải là ngày hợp lệ' })
  startTo?: string;

  @ApiPropertyOptional({
    example: '2026-06-20T00:00:00.000Z',
    description: 'Lọc từ thời gian kết thúc hoặc hạn hoàn thành',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Thời gian kết thúc từ phải là ngày hợp lệ' })
  dueFrom?: string;

  @ApiPropertyOptional({
    example: '2026-06-30T23:59:59.000Z',
    description: 'Lọc đến thời gian kết thúc hoặc hạn hoàn thành',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Thời gian kết thúc đến phải là ngày hợp lệ' })
  dueTo?: string;
}
