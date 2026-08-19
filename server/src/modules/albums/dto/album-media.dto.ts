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
import { AlbumTagResponseDto } from './album-tags.dto';

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

class AlbumCollectionSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Gia đình' })
  name!: string;

  @ApiProperty({ example: 'Ảnh kỷ niệm gia đình', nullable: true })
  description!: string | null;
}

class AlbumUploadedByResponseDto {
  @ApiProperty({ format: 'uuid' })
  memberId!: string;

  @ApiProperty({ example: 'ngia' })
  displayName!: string;

  @ApiProperty({ example: 'FAMILY_MEMBER' })
  familyRole!: string;

  @ApiProperty({ example: 'https://example.com/avatar.png', nullable: true })
  avatarUrl!: string | null;
}

class AlbumFileAccessResponseDto {
  @ApiProperty({ example: 'https://signed-r2.example/photo.jpg' })
  url!: string;

  @ApiProperty({ example: 600 })
  expiresInSeconds!: number;
}

class AlbumMediaPermissionsResponseDto {
  @ApiProperty({ example: true })
  canEdit!: boolean;

  @ApiProperty({ example: true })
  canSoftDelete!: boolean;

  @ApiProperty({ example: false })
  canRestore!: boolean;

  @ApiProperty({ example: false })
  canPermanentDelete!: boolean;

  @ApiProperty({ example: true })
  canTag!: boolean;

  @ApiProperty({ example: false })
  canReviewModeration!: boolean;
}

export class AlbumMediaResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: AlbumMediaType, example: AlbumMediaType.PHOTO })
  mediaType!: AlbumMediaType;

  @ApiProperty({
    type: () => AlbumCollectionSummaryResponseDto,
    nullable: true,
  })
  collection!: AlbumCollectionSummaryResponseDto | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  collectionId!: string | null;

  @ApiProperty({ example: 'Kỷ niệm gia đình', nullable: true })
  caption!: string | null;

  @ApiProperty({
    enum: AlbumVisibilityScope,
    example: AlbumVisibilityScope.FAMILY,
  })
  visibilityScope!: AlbumVisibilityScope;

  @ApiProperty({
    enum: MediaModerationStatus,
    example: MediaModerationStatus.SAFE,
  })
  moderationStatus!: MediaModerationStatus;

  @ApiProperty({ example: 1 })
  tagCount!: number;

  @ApiProperty({ example: 'photo.jpg', nullable: true })
  originalFileName!: string | null;

  @ApiProperty({ example: 'image/jpeg', nullable: true })
  mimeType!: string | null;

  @ApiProperty({ example: 102400, nullable: true })
  fileSize!: number | null;

  @ApiProperty({ format: 'date-time' })
  uploadedAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ format: 'date-time', nullable: true })
  deletedAt!: Date | null;

  @ApiProperty({
    example: 'Người dùng xóa nhầm',
    nullable: true,
    required: false,
  })
  deleteReason?: string | null;

  @ApiProperty({ type: () => AlbumUploadedByResponseDto })
  uploadedBy!: AlbumUploadedByResponseDto;

  @ApiProperty({
    type: () => [AlbumTagResponseDto],
    description:
      'Existing confirmed tags for this media. Use taggedMemberId to filter already-tagged face suggestions.',
  })
  tags!: AlbumTagResponseDto[];

  @ApiProperty({ type: () => AlbumFileAccessResponseDto, nullable: true })
  fileAccess!: AlbumFileAccessResponseDto | null;

  @ApiProperty({ type: () => AlbumMediaPermissionsResponseDto })
  permissions!: AlbumMediaPermissionsResponseDto;
}

class AlbumMediaListMetaResponseDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

class AlbumMediaListDataResponseDto {
  @ApiProperty({ type: () => [AlbumMediaResponseDto] })
  items!: AlbumMediaResponseDto[];

  @ApiProperty({ type: () => AlbumMediaListMetaResponseDto })
  meta!: AlbumMediaListMetaResponseDto;
}

export class AlbumMediaApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Lấy chi tiết media thành công' })
  message!: string;

  @ApiProperty({ type: () => AlbumMediaResponseDto })
  data!: AlbumMediaResponseDto;
}

export class AlbumMediaListApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Lấy danh sách media album thành công' })
  message!: string;

  @ApiProperty({ type: () => AlbumMediaListDataResponseDto })
  data!: AlbumMediaListDataResponseDto;
}
