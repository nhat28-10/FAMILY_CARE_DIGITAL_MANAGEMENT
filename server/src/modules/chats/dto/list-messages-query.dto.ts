import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListMessagesQueryDto {
  @ApiPropertyOptional({
    description: 'messageId cuối của trang trước (cursor pagination, mới → cũ)',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4')
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Số tin mỗi trang (mặc định 30, tối đa 100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Tìm kiếm theo nội dung tin nhắn' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
