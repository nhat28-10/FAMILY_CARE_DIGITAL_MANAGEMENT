import {
  AlbumMediaType,
  AlbumVisibilityScope,
  MediaModerationStatus,
} from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export enum AlbumSortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum AlbumDeletedView {
  ACTIVE = 'ACTIVE',
  TRASH = 'TRASH',
}

export enum AlbumDraftContentIntent {
  PEOPLE = 'PEOPLE',
  SCENE_OR_OBJECT = 'SCENE_OR_OBJECT',
}

export class AnalyzeAlbumDraftDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  collectionId?: string;

  @ApiPropertyOptional({
    maxLength: 120,
    example: 'Đi biển',
    description:
      'Chủ đề tạm thời nếu FE chưa chọn collection hoặc muốn override tên collection',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  topic?: string;

  @ApiPropertyOptional({ enum: AlbumDraftContentIntent })
  @IsOptional()
  @IsEnum(AlbumDraftContentIntent)
  declaredContentIntent?: AlbumDraftContentIntent;
}

export class UploadAlbumMediaDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  collectionId?: string;

  @ApiPropertyOptional({ maxLength: 1000, example: 'Kỷ niệm gia đình' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  caption?: string;

  @ApiPropertyOptional({
    enum: AlbumVisibilityScope,
    default: AlbumVisibilityScope.FAMILY,
  })
  @IsOptional()
  @IsEnum(AlbumVisibilityScope)
  visibilityScope: AlbumVisibilityScope = AlbumVisibilityScope.FAMILY;
}

export class ListAlbumMediaQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  collectionId?: string;

  @ApiPropertyOptional({ enum: AlbumMediaType })
  @IsOptional()
  @IsEnum(AlbumMediaType)
  mediaType?: AlbumMediaType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  uploaderMemberId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  taggedMemberId?: string;

  @ApiPropertyOptional({ enum: AlbumVisibilityScope })
  @IsOptional()
  @IsEnum(AlbumVisibilityScope)
  visibilityScope?: AlbumVisibilityScope;

  @ApiPropertyOptional({ enum: MediaModerationStatus })
  @IsOptional()
  @IsEnum(MediaModerationStatus)
  moderationStatus?: MediaModerationStatus;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ enum: AlbumSortOrder, default: AlbumSortOrder.DESC })
  @IsOptional()
  @IsEnum(AlbumSortOrder)
  sortOrder: AlbumSortOrder = AlbumSortOrder.DESC;

  @ApiPropertyOptional({
    enum: AlbumDeletedView,
    default: AlbumDeletedView.ACTIVE,
  })
  @IsOptional()
  @IsEnum(AlbumDeletedView)
  deletedView: AlbumDeletedView = AlbumDeletedView.ACTIVE;
}

export class UpdateAlbumMediaDto {
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Gửi null để bỏ media khỏi album/collection',
  })
  @IsOptional()
  @IsUUID()
  collectionId?: string | null;

  @ApiPropertyOptional({
    maxLength: 1000,
    nullable: true,
    description: 'Gửi null hoặc chuỗi rỗng để xóa caption',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  caption?: string | null;

  @ApiPropertyOptional({ enum: AlbumVisibilityScope })
  @IsOptional()
  @IsEnum(AlbumVisibilityScope)
  visibilityScope?: AlbumVisibilityScope;
}

export class SoftDeleteAlbumMediaDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class PermanentDeleteAlbumMediaDto {
  @ApiProperty({ example: 'PERMANENT_DELETE' })
  @IsString()
  @Equals('PERMANENT_DELETE')
  confirmation!: 'PERMANENT_DELETE';
}
