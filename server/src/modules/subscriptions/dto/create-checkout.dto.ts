import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionPlanCode } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class CreateCheckoutDto {
  @ApiProperty({
    enum: SubscriptionPlanCode,
    example: SubscriptionPlanCode.PLUS,
    description: 'Mã gói muốn nâng cấp (chỉ gói trả phí: PLUS/PREMIUM)',
  })
  @IsEnum(SubscriptionPlanCode)
  planCode: SubscriptionPlanCode;
}
