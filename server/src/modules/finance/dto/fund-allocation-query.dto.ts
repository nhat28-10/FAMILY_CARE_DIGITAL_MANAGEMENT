import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class FundAllocationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Lọc lịch sử chia quỹ theo mô hình tài chính.',
  })
  @IsOptional()
  @IsUUID()
  modelId?: string;

  @ApiPropertyOptional({
    example: 7,
    minimum: 1,
    maximum: 12,
    description:
      'Tháng của kỳ chia quỹ. Cần truyền cùng periodYear khi lọc theo kỳ.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth?: number;

  @ApiPropertyOptional({
    example: 2026,
    minimum: 1900,
    maximum: 9999,
    description:
      'Năm của kỳ chia quỹ. Cần truyền cùng periodMonth khi lọc theo kỳ.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(9999)
  periodYear?: number;
}
