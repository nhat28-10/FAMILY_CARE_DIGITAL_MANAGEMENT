import { AlbumMediaType, MediaModerationStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  Matches,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { AlbumSortOrder } from './album-media.dto';

export enum ManualModerationDecision {
  MARK_SAFE = 'MARK_SAFE',
  KEEP_FLAGGED = 'KEEP_FLAGGED',
}

export class ListModerationQueueQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: MediaModerationStatus,
    description: 'Mặc định lấy PENDING, PROCESSING, NEED_REVIEW và FLAGGED',
  })
  @IsOptional()
  @IsEnum(MediaModerationStatus)
  moderationStatus?: MediaModerationStatus;

  @ApiPropertyOptional({ enum: AlbumMediaType })
  @IsOptional()
  @IsEnum(AlbumMediaType)
  mediaType?: AlbumMediaType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  uploaderMemberId?: string;

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
}

export class ManualModerationReviewDto {
  @ApiProperty({ enum: ManualModerationDecision })
  @IsEnum(ManualModerationDecision)
  decision!: ManualModerationDecision;

  @ApiProperty({ maxLength: 1000, example: 'Đã kiểm tra thủ công.' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'Review note không được chỉ chứa khoảng trắng' })
  @MaxLength(1000)
  reviewNote!: string;
}
