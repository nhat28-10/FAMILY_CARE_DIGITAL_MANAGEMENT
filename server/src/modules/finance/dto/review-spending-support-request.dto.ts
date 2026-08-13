import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const ISO_DATE_TIME_WITH_TIMEZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export enum SpendingSupportDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export class ReviewSpendingSupportRequestDto {
  @ApiProperty({ enum: SpendingSupportDecision })
  @IsEnum(SpendingSupportDecision)
  decision!: SpendingSupportDecision;

  @ApiPropertyOptional({ example: 'Đã kiểm tra nhu cầu hỗ trợ' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  decisionNote?: string;

  @ApiPropertyOptional({ example: '2026-06-11T08:30:00.000Z' })
  @IsOptional()
  @IsDateString()
  @Matches(ISO_DATE_TIME_WITH_TIMEZONE, {
    message:
      'occurredAt phải là ISO datetime có timezone, ví dụ 2026-06-11T08:30:00.000Z hoặc 2026-06-11T15:30:00+07:00',
  })
  occurredAt?: string;
}
