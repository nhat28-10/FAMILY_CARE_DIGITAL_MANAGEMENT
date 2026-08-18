import { ApiPropertyOptional } from '@nestjs/swagger';
import { SosSeverity, SosSourceType, SosTriggerReason } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSosAlertDto {
  @ApiPropertyOptional({
    enum: SosSourceType,
    default: SosSourceType.MOBILE_APP,
    description: 'Nguồn kích hoạt',
  })
  @IsOptional()
  @IsEnum(SosSourceType)
  sourceType?: SosSourceType;

  @ApiPropertyOptional({
    enum: SosTriggerReason,
    default: SosTriggerReason.MANUAL,
    description: 'Lý do kích hoạt SOS',
  })
  @IsOptional()
  @IsEnum(SosTriggerReason)
  triggerReason?: SosTriggerReason;

  @ApiPropertyOptional({ enum: SosSeverity })
  @IsOptional()
  @IsEnum(SosSeverity)
  severity?: SosSeverity;

  @ApiPropertyOptional({ example: 10.762622, minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  initialLatitude?: number;

  @ApiPropertyOptional({ example: 106.660172, minimum: -180, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  initialLongitude?: number;

  @ApiPropertyOptional({ example: 'Tôi cần giúp đỡ khẩn cấp' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
