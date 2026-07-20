import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingPeriod } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import { OFFICIAL_FEATURE_ACCESS_KEYS } from '../../subscriptions/feature-access.constants';
import { IsFeatureAccessMap } from './feature-access-map.validator';

export class CreateSubscriptionPlanDto {
  @ApiProperty({
    example: 'MONTHLY',
    description:
      'Mã gói duy nhất, chữ hoa/số/gạch dưới. FREE là mã dành riêng cho gói mặc định.',
  })
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: 'planCode chỉ gồm chữ in hoa, số và gạch dưới.',
  })
  planCode: string;

  @ApiProperty({ example: 'Gói tháng' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    example: 180000,
    description:
      'Legacy display price. Prefer monthlyPrice/yearlyPrice with billingPeriod.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  annualPrice?: number;

  @ApiPropertyOptional({
    enum: BillingPeriod,
    example: BillingPeriod.MONTHLY,
    description: 'Billing cadence for this plan.',
  })
  @IsOptional()
  @IsEnum(BillingPeriod)
  billingPeriod?: BillingPeriod;

  @ApiPropertyOptional({
    example: 180000,
    description: 'Monthly price for MONTHLY plans.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyPrice?: number;

  @ApiPropertyOptional({
    example: 1800000,
    description: 'Yearly price for YEARLY plans.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  yearlyPrice?: number;

  @ApiProperty({ example: 10, description: 'Số thành viên tối đa' })
  @IsInt()
  @Min(1)
  maxMembers: number;

  @ApiProperty({ example: 5120, description: 'Dung lượng lưu trữ (MB)' })
  @IsInt()
  @Min(0)
  storageLimit: number;

  @ApiPropertyOptional({
    description: 'Map tính năng theo key chính thức.',
    enum: OFFICIAL_FEATURE_ACCESS_KEYS,
    example: {
      'calendar.enabled': true,
      'calendar.reminders': true,
      'calendar.recurringEvents': true,
      'album.faceSuggestions': true,
    },
  })
  @IsOptional()
  @IsObject()
  @IsFeatureAccessMap()
  featureAccess?: Record<string, boolean>;

  @ApiPropertyOptional({
    description: 'Stripe recurring Price id. Bắt buộc cho gói trả phí.',
    example: 'price_1Xxxx',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  stripePriceId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
