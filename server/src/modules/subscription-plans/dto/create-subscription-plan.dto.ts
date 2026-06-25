import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSubscriptionPlanDto {
  @ApiProperty({
    example: 'GOLD',
    description:
      'Mã gói duy nhất, CHỮ HOA/số/gạch dưới (vd FREE, PLUS, PREMIUM, GOLD). FREE là mã dành riêng cho gói mặc định.',
  })
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: 'planCode chỉ gồm chữ in hoa, số và gạch dưới (bắt đầu bằng chữ)',
  })
  planCode: string;

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
    description:
      'Stripe recurring Price id (bắt buộc cho gói trả phí PLUS/PREMIUM)',
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
