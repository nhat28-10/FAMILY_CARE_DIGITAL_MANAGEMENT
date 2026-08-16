import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CreateAlbumCollectionDto {
  @ApiProperty({ maxLength: 120, example: 'Đi biển' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    maxLength: 500,
    example: 'Kỷ niệm chuyến đi biển của gia đình',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  coverMediaId?: string;
}

export class ListAlbumCollectionsQueryDto extends PaginationQueryDto {}

export class UpdateAlbumCollectionDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    maxLength: 500,
    nullable: true,
    description: 'Gửi null hoặc chuỗi rỗng để xóa mô tả',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Gửi null để bỏ ảnh bìa',
  })
  @IsOptional()
  @IsUUID()
  coverMediaId?: string | null;
}
