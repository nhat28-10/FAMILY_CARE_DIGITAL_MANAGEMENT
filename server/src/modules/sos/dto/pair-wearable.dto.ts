import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WearableDeviceType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class PairWearableDto {
  @ApiProperty({ example: 'Đồng hồ của bà' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  deviceName!: string;

  @ApiProperty({ enum: WearableDeviceType })
  @IsEnum(WearableDeviceType)
  deviceType!: WearableDeviceType;

  @ApiProperty({
    example: 'SN-2026-0001',
    description: 'Số serial / MAC — duy nhất trong gia đình',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  deviceIdentifier!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  gpsEnabled?: boolean;

  @ApiPropertyOptional({
    default: true,
    description: 'Mỗi thành viên chỉ có 1 thiết bị SOS đang ghép nối',
  })
  @IsOptional()
  @IsBoolean()
  sosEnabled?: boolean;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Ghép nối hộ thành viên khác (chỉ FAMILY_MANAGER / DEPUTY_MEMBER)',
  })
  @IsOptional()
  @IsUUID()
  ownerMemberId?: string;
}
