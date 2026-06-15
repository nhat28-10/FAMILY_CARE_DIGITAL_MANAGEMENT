import { ApiPropertyOptional } from '@nestjs/swagger';
import { BudgetPeriodType, BudgetPlanStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class BudgetPlanQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BudgetPlanStatus })
  @IsOptional()
  @IsEnum(BudgetPlanStatus)
  status?: BudgetPlanStatus;

  @ApiPropertyOptional({ enum: BudgetPeriodType })
  @IsOptional()
  @IsEnum(BudgetPeriodType)
  periodType?: BudgetPeriodType;
}
