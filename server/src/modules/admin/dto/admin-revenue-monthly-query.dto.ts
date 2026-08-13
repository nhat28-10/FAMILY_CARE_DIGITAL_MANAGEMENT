import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class AdminRevenueMonthlyQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ example: 'YEARLY' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  planCode?: string;
}

export class AdminMonthlyRevenueItemDto {
  @ApiProperty({
    example: '2026-07',
    description:
      'UTC month bucket in YYYY-MM format, based on payment createdAt.',
  })
  month!: string;

  @ApiProperty({
    example: 5540000,
    description:
      'Total paid revenue for the month. This is SUM(payment_transactions.amount), not payment count.',
  })
  totalRevenue!: number;

  @ApiProperty({
    example: 0,
    description:
      'Paid revenue for rows resolved to planCode MONTHLY. This is an amount sum, not count.',
  })
  monthlyRevenue!: number;

  @ApiProperty({
    example: 5540000,
    description:
      'Paid revenue for rows resolved to planCode YEARLY. This is an amount sum, not count.',
  })
  yearlyRevenue!: number;

  @ApiProperty({
    example: 4,
    description: 'Number of paid payment rows included in this month bucket.',
  })
  paidCount!: number;

  @ApiProperty({
    example: 'vnd',
    description: 'Currency for the revenue amounts in this bucket.',
  })
  currency!: string;
}
