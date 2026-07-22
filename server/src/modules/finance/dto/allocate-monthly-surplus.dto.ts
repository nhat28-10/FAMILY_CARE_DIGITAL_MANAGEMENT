import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AllocateMonthlySurplusDto {
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

  @ApiProperty({ example: 1500000, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ example: 'Chuyen tu so du quy thang 6 vao muc tieu' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
