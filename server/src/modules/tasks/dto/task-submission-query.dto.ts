import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskSubmissionStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class TaskSubmissionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: TaskSubmissionStatus,
    description: 'Lọc minh chứng hoàn thành công việc theo trạng thái',
  })
  @IsOptional()
  @IsEnum(TaskSubmissionStatus, {
    message: 'Trạng thái minh chứng hoàn thành công việc không hợp lệ',
  })
  status?: TaskSubmissionStatus;
}
