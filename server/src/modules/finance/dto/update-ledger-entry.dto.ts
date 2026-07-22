import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LedgerEntryType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const ISO_DATE_TIME_WITH_TIMEZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export class UpdateLedgerEntryDto {
  @ApiPropertyOptional({ enum: LedgerEntryType })
  @IsOptional()
  @IsEnum(LedgerEntryType)
  entryType?: LedgerEntryType;

  @ApiPropertyOptional({ example: 250000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({ example: 'Mua thuc pham trong tuan' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'Mua tai cho gan nha', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  @ApiPropertyOptional({ example: '2026-06-10T08:30:00.000Z' })
  @IsOptional()
  @IsDateString()
  @Matches(ISO_DATE_TIME_WITH_TIMEZONE, {
    message:
      'entryDate phải là ISO datetime có timezone, ví dụ 2026-06-10T08:30:00.000Z hoặc 2026-06-10T15:30:00+07:00',
  })
  entryDate?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  jarId?: string | null;

  @ApiPropertyOptional({ example: 'TASK_REWARD', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceType?: string | null;

  @ApiPropertyOptional({ example: 'task-or-request-id', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceId?: string | null;
}
