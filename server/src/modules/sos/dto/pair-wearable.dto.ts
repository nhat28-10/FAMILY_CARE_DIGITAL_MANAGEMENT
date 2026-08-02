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
  @ApiProperty({ example: 'Wear OS Simulator' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  deviceName!: string;

  @ApiProperty({ enum: WearableDeviceType })
  @IsEnum(WearableDeviceType)
  deviceType!: WearableDeviceType;

  @ApiProperty({
    example: 'wearos-emulator-001',
    description: 'Serial number / MAC / emulator id, unique within a family',
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
    description: 'One user account can have only one paired wearable',
  })
  @IsOptional()
  @IsBoolean()
  sosEnabled?: boolean;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Pair a wearable for another family member. FAMILY_MANAGER or DEPUTY_MEMBER only.',
  })
  @IsOptional()
  @IsUUID()
  ownerMemberId?: string;
}
