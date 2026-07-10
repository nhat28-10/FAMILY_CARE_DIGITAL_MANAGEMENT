import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export const ADMIN_PAYMENT_STATUSES = ['PAID', 'FAILED', 'PENDING'] as const;
export type AdminPaymentStatus = (typeof ADMIN_PAYMENT_STATUSES)[number];

export class AdminPaymentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ADMIN_PAYMENT_STATUSES })
  @IsOptional()
  @IsIn(ADMIN_PAYMENT_STATUSES)
  status?: AdminPaymentStatus;

  @ApiPropertyOptional({ example: 'MONTHLY' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  planCode?: string;
}
