import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FinanceVisibility } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateMemberMonthlyFinanceDto {
  @ApiProperty({ example: 6, minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth!: number;

  @ApiProperty({ example: 2026, minimum: 1900, maximum: 9999 })
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(9999)
  periodYear!: number;

  @ApiPropertyOptional({
    example: 15000000,
    nullable: true,
    description: 'Null means not declared or not applicable; zero is explicit',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expectedIncome?: number | null;

  @ApiPropertyOptional({ example: 14500000, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  actualIncome?: number | null;

  @ApiPropertyOptional({ example: 5000000, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expectedPersonalExpense?: number | null;

  @ApiPropertyOptional({ example: 4800000, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  actualPersonalExpense?: number | null;

  @ApiPropertyOptional({
    enum: FinanceVisibility,
    default: FinanceVisibility.PRIVATE,
  })
  @IsOptional()
  @IsEnum(FinanceVisibility)
  incomeVisibility?: FinanceVisibility;

  @ApiPropertyOptional({
    enum: FinanceVisibility,
    default: FinanceVisibility.PRIVATE,
  })
  @IsOptional()
  @IsEnum(FinanceVisibility)
  expenseVisibility?: FinanceVisibility;

  @ApiPropertyOptional({
    example: 'Expected bonus is not included',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}
