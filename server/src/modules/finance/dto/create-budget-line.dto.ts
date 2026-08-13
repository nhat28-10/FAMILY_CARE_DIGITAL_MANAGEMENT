import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EssentialType } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBudgetLineDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  jarId?: string;

  @ApiProperty({ example: 5000000, minimum: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  plannedAmount!: number;

  @ApiPropertyOptional({ example: 5500000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  thresholdAmount?: number;

  @ApiPropertyOptional({ example: 10, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  thresholdPercent?: number;

  @ApiPropertyOptional({ enum: EssentialType })
  @IsOptional()
  @IsEnum(EssentialType)
  essentialType?: EssentialType;

  @ApiPropertyOptional({ example: 'Ngân sách thực phẩm hằng tháng' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
