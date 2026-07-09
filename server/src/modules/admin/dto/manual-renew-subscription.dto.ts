import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ManualRenewSubscriptionDto {
  @ApiProperty({ example: 'MONTHLY' })
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  planCode: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 60 })
  @IsInt()
  @Min(1)
  @Max(60)
  monthsToAdd: number;

  @ApiPropertyOptional({
    example: 'Gia hạn thủ công sau lỗi webhook Stripe',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
