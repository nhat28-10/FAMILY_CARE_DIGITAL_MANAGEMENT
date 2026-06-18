import { ApiPropertyOptional } from '@nestjs/swagger';
import { RewardDisputeStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryRewardDisputeDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: RewardDisputeStatus,
    description: 'Lọc tranh chấp thưởng theo trạng thái',
  })
  @IsOptional()
  @IsEnum(RewardDisputeStatus, {
    message: 'Trạng thái tranh chấp thưởng không hợp lệ',
  })
  status?: RewardDisputeStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Lọc theo ghi nhận thưởng',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Ghi nhận thưởng không hợp lệ' })
  rewardSettlementId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Lọc theo thành viên gửi tranh chấp',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Thành viên gửi tranh chấp không hợp lệ' })
  reportedByMemberId?: string;
}
