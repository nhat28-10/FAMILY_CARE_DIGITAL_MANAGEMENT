import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskUnavailabilityStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryTaskUnavailabilityDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: TaskUnavailabilityStatus,
    description: 'Lọc báo cáo theo trạng thái',
  })
  @IsOptional()
  @IsEnum(TaskUnavailabilityStatus, {
    message: 'Trạng thái báo cáo không hợp lệ',
  })
  status?: TaskUnavailabilityStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Lọc theo ID phân công công việc',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Phân công công việc không hợp lệ' })
  assignmentId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Lọc theo ID thành viên tạo báo cáo',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Thành viên tạo báo cáo không hợp lệ' })
  reportedByMemberId?: string;
}
