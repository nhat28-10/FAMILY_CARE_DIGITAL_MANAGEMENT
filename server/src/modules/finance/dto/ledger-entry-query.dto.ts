import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class LedgerEntryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 1,
    minimum: 1,
    default: 1,
    description: 'Trang cần lấy, mặc định là 1',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
    description: 'Số bản ghi mỗi trang, mặc định 20 và tối đa 100',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({
    example: 6,
    minimum: 1,
    maximum: 12,
    description:
      'Lọc giao dịch theo tháng. Nếu chỉ truyền year, mặc định dùng tháng hiện tại.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({
    example: 2026,
    minimum: 1900,
    maximum: 9999,
    description:
      'Lọc giao dịch theo năm. Nếu chỉ truyền month, mặc định dùng năm hiện tại.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(9999)
  year?: number;
}
