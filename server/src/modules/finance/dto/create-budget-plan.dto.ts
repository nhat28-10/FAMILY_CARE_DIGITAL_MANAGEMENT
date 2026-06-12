import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BudgetPeriodType } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { CreateBudgetLineDto } from './create-budget-line.dto';

export class CreateBudgetPlanDto {
  @ApiProperty({ example: 'Household budget - June 2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  planName!: string;

  @ApiProperty({ enum: BudgetPeriodType })
  @IsEnum(BudgetPeriodType)
  periodType!: BudgetPeriodType;

  @ApiProperty({ example: '2026-06-01' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ example: '2026-06-30' })
  @IsDateString()
  periodEnd!: string;

  @ApiPropertyOptional({ example: 30000000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expectedSharedIncome?: number;

  @ApiPropertyOptional({ example: 25000000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expectedSharedExpense?: number;

  @ApiPropertyOptional({ type: [CreateBudgetLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBudgetLineDto)
  lines?: CreateBudgetLineDto[];
}
