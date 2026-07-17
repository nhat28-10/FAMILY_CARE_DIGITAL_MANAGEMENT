import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DevicePlatform } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class RegisterDeviceTokenDto {
  @ApiProperty({
    description: 'FCM registration token của thiết bị',
    maxLength: 4096,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;

  @ApiProperty({ enum: DevicePlatform, description: 'Nền tảng thiết bị' })
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @ApiPropertyOptional({
    description: 'Tên thiết bị hiển thị',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceName?: string;
}
