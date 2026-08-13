import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GpsSourceType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class PushSosLocationDto {
  @ApiProperty({ example: 10.762622, minimum: -90, maximum: 90 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: 106.660172, minimum: -180, maximum: 180 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({ example: 12.5, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  accuracy?: number;

  @ApiProperty({ enum: GpsSourceType })
  @IsEnum(GpsSourceType)
  sourceType!: GpsSourceType;

  @ApiPropertyOptional({
    description: 'Thời điểm ghi nhận (ISO8601), mặc định là hiện tại',
    example: '2026-06-18T08:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  recordedAt?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Thiết bị nguồn (nếu có)',
  })
  @IsOptional()
  @IsUUID()
  deviceId?: string;
}
