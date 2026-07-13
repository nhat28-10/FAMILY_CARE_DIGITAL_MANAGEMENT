import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BudgetPeriodType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateBudgetPlanDto {
  @ApiPropertyOptional({ example: 'Cập nhật ngân sách gia đình' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  planName?: string;

  @ApiPropertyOptional({ enum: BudgetPeriodType })
  @IsOptional()
  @IsEnum(BudgetPeriodType)
  periodType?: BudgetPeriodType;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @ApiPropertyOptional({ example: 30000000, minimum: 0, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expectedSharedIncome?: number | null;

  @ApiPropertyOptional({ example: 25000000, minimum: 0, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expectedSharedExpense?: number | null;
}
