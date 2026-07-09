import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FamilySubscriptionStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSubscriptionStatusDto {
  @ApiProperty({ enum: FamilySubscriptionStatus, example: 'ACTIVE' })
  @IsEnum(FamilySubscriptionStatus)
  status: FamilySubscriptionStatus;

  @ApiPropertyOptional({
    example: 'Cập nhật trạng thái subscription thủ công',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
