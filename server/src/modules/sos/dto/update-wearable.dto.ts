import { ApiPropertyOptional } from '@nestjs/swagger';
import { DevicePairingStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateWearableDto {
  @ApiPropertyOptional({ example: 'Đồng hồ của ông' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  deviceName?: string;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsBoolean()
  gpsEnabled?: boolean;

  @ApiPropertyOptional({})
  @IsOptional()
  @IsBoolean()
  sosEnabled?: boolean;

  @ApiPropertyOptional({
    enum: DevicePairingStatus,
    description: 'UNPAIRED = gỡ ghép nối, LOST = báo mất',
  })
  @IsOptional()
  @IsEnum(DevicePairingStatus)
  pairingStatus?: DevicePairingStatus;
}
