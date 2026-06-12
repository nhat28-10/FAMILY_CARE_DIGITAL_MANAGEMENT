import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  BudgetAlertSeverity,
  BudgetAlertStatus,
  BudgetAlertType,
} from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class BudgetAlertQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BudgetAlertStatus })
  @IsOptional()
  @IsEnum(BudgetAlertStatus)
  status?: BudgetAlertStatus;

  @ApiPropertyOptional({ enum: BudgetAlertType })
  @IsOptional()
  @IsEnum(BudgetAlertType)
  alertType?: BudgetAlertType;

  @ApiPropertyOptional({ enum: BudgetAlertSeverity })
  @IsOptional()
  @IsEnum(BudgetAlertSeverity)
  severity?: BudgetAlertSeverity;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  budgetPlanId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  goalId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  jarId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}
