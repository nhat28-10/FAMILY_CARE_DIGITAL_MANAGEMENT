import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  IsPositive,
} from 'class-validator';

export class CreateFinancialGoalDto {
  @ApiProperty({ example: 'Quỹ dự phòng khẩn cấp' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  goalName!: string;

  @ApiProperty({ example: 30000000, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  targetAmount!: number;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional({ example: 3000000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyContributionTarget?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  relatedJarId?: string;
}
