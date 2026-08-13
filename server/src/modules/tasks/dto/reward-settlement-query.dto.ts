import { ApiPropertyOptional } from '@nestjs/swagger';
import { RewardSettlementStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class RewardSettlementQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: RewardSettlementStatus,
    description: 'Lọc ghi nhận thưởng theo trạng thái',
  })
  @IsOptional()
  @IsEnum(RewardSettlementStatus, {
    message: 'Trạng thái ghi nhận thưởng không hợp lệ',
  })
  status?: RewardSettlementStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Lọc theo thành viên nhận thưởng',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Thành viên nhận thưởng không hợp lệ' })
  receiverMemberId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Lọc theo công việc',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Công việc không hợp lệ' })
  taskId?: string;
}
