import { ApiPropertyOptional } from '@nestjs/swagger';
import { WearableDeviceType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWearableActivationDto {
  @ApiPropertyOptional({ example: 'Wear OS Watch' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceName?: string;

  @ApiPropertyOptional({
    enum: WearableDeviceType,
    default: WearableDeviceType.SMARTWATCH,
  })
  @IsOptional()
  @IsEnum(WearableDeviceType)
  deviceType?: WearableDeviceType;
}
