import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionPlanCode } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSubscriptionPlanDto {
  @ApiProperty({
    enum: SubscriptionPlanCode,
    example: SubscriptionPlanCode.PLUS,
  })
  @IsEnum(SubscriptionPlanCode)
  planCode: SubscriptionPlanCode;

  @ApiProperty({ example: 'Gói Plus' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 990000, description: 'Giá theo năm (annual-only)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  annualPrice: number;

  @ApiProperty({ example: 10, description: 'Số thành viên tối đa' })
  @IsInt()
  @Min(1)
  maxMembers: number;

  @ApiProperty({ example: 5120, description: 'Dung lượng lưu trữ (MB)' })
  @IsInt()
  @Min(0)
  storageLimit: number;

  @ApiPropertyOptional({
    description: 'Map tính năng/giới hạn theo gói',
    example: { aiChatbot: true, sos: true },
  })
  @IsOptional()
  @IsObject()
  featureAccess?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Stripe recurring Price id (bắt buộc cho gói trả phí PLUS/PREMIUM)',
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
