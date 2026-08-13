import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateLedgerEntryDto {
  @ApiProperty({ enum: LedgerEntryType })
  @IsEnum(LedgerEntryType)
  entryType!: LedgerEntryType;

  @ApiProperty({ example: 250000, description: 'Số tiền phải lớn hơn 0' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiProperty({ example: 'Mua thực phẩm trong tuần' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description!: string;

  @ApiPropertyOptional({ example: 'Mua tại chợ gần nhà' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiProperty({ example: '2026-06-10T08:30:00.000Z' })
  @IsDateString()
  @Matches(ISO_DATE_TIME_WITH_TIMEZONE, {
    message:
      'entryDate phải là ISO datetime có timezone, ví dụ 2026-06-10T08:30:00.000Z hoặc 2026-06-10T15:30:00+07:00',
  })
  entryDate!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  jarId?: string;

  @ApiPropertyOptional({ example: 'TASK_REWARD' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceType?: string;

  @ApiPropertyOptional({ example: 'task-or-request-id' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceId?: string;
}
