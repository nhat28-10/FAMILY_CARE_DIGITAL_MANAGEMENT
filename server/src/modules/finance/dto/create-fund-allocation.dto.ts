import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateFundAllocationDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Finance model to use. Defaults to the active model of the family.',
  })
  @IsOptional()
  @IsUUID()
  modelId?: string;

  @ApiProperty({ example: 10000000, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiProperty({ example: 7, minimum: 1, maximum: 12 })
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

  @ApiPropertyOptional({ example: 'Chia quy thang 7 theo mo hinh Five Jars' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
