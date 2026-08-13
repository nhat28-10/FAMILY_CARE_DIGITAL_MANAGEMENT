import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class RequiredFinancePeriodDto {
  @ApiProperty({ example: 6, minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty({ example: 2026, minimum: 1900, maximum: 9999 })
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(9999)
  year!: number;
}

export class OptionalFinancePeriodDto {
  @ApiPropertyOptional({
    example: 6,
    minimum: 1,
    maximum: 12,
    description: 'Defaults to the current month',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({
    example: 2026,
    minimum: 1900,
    maximum: 9999,
    description: 'Defaults to the current year',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(9999)
  year?: number;
}
