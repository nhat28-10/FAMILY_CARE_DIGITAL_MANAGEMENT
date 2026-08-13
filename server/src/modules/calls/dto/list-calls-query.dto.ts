import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListCallsQueryDto {
  @ApiPropertyOptional({
    description:
      'id cuộc gọi cuối của trang trước (cursor pagination, mới → cũ)',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4')
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Số cuộc gọi mỗi trang (mặc định 30, tối đa 100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
