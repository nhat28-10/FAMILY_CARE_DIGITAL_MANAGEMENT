import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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
  occurredAt?: string;
}
