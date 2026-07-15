import { ApiPropertyOptional } from '@nestjs/swagger';
import { JoinRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListJoinRequestsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: JoinRequestStatus })
  @IsOptional()
  @IsEnum(JoinRequestStatus)
  status?: JoinRequestStatus;

  @ApiPropertyOptional({ description: 'Filter by family id' })
  @IsOptional()
  @IsUUID()
  familyId?: string;
}
