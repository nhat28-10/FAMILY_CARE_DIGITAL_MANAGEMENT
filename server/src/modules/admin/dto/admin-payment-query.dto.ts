import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
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

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  familyId?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
