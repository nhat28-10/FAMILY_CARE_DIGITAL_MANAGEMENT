import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

export const BUDGET_ALERT_SCOPES = [
  'ALL',
  'BUDGET',
  'GOAL',
  'NON_ESSENTIAL',
] as const;

export type BudgetAlertScope = (typeof BUDGET_ALERT_SCOPES)[number];

export class RecomputeBudgetAlertsDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  budgetPlanId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  goalId?: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @ApiPropertyOptional({ enum: BUDGET_ALERT_SCOPES, default: 'ALL' })
  @IsOptional()
  @IsIn(BUDGET_ALERT_SCOPES)
  scope: BudgetAlertScope = 'ALL';
}
