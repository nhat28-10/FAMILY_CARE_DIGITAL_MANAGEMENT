import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SpendingSupportRequestStatus } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class SpendingSupportRequestQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SpendingSupportRequestStatus })
  @IsOptional()
  @IsEnum(SpendingSupportRequestStatus)
  status?: SpendingSupportRequestStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  requesterMemberId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === 'true',
  )
  @IsBoolean()
  mine: boolean = false;
}
