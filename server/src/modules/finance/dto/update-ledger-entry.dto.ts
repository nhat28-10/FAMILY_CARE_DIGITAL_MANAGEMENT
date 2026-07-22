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
  MaxLength,
} from 'class-validator';

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
