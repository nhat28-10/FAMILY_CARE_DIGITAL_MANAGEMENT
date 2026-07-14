import { ApiPropertyOptional } from '@nestjs/swagger';
import { JoinRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListJoinRequestsQueryDto {
  @ApiPropertyOptional({
    enum: JoinRequestStatus,
    description: 'Lọc theo trạng thái (vd PENDING để xem yêu cầu chờ duyệt)',
  })
  @IsOptional()
  @IsEnum(JoinRequestStatus)
  status?: JoinRequestStatus;
}
