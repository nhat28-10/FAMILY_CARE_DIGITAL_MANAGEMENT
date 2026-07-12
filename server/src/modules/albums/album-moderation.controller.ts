import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FamilyRole } from '@prisma/client';
import type { FamilyMember } from '@prisma/client';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentFamilyMember } from '../family-members/decorators/current-family-member.decorator';
import { FamilyRoles } from '../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../family-members/guards/family-permission.guard';
import {
  ListModerationQueueQueryDto,
  ManualModerationReviewDto,
} from './dto/album-moderation.dto';
import { AlbumModerationService } from './moderation/album-moderation.service';
import { albumMemberTracker } from './album-throttle';

@ApiTags('Album Moderation')
@ApiBearerAuth()
@ApiParam({ name: 'familyId', description: 'ID gia đình', format: 'uuid' })
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/albums')
export class AlbumModerationController {
  constructor(private readonly moderation: AlbumModerationService) {}

  @Get('moderation')
  @FamilyRoles(FamilyRole.FAMILY_MANAGER, FamilyRole.DEPUTY_MEMBER)
  @ApiOperation({
    summary: 'Danh sách media cần moderation',
    description:
      'Chỉ Manager/Deputy. AI hỗ trợ tự động; score là heuristic, không phải xác suất chắc chắn.',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách moderation có pagination',
    schema: {
      example: {
        items: [
          {
            mediaId: 'uuid',
            mediaType: 'PHOTO',
            moderationStatus: 'NEED_REVIEW',
            moderationAttemptCount: 2,
            latestModeration: {
              resultStatus: 'NEED_REVIEW',
              riskScore: 0.56,
              summary: 'Cần quản lý kiểm tra thủ công.',
            },
            fileAccess: { url: 'signed-url', expiresInSeconds: 600 },
          },
        ],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      },
    },
  })
  @ResponseMessage('Lấy moderation queue thành công')
  listQueue(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember() member: FamilyMember,
    @Query() query: ListModerationQueueQueryDto,
  ) {
    return this.moderation.listQueue(familyId, member, query);
  }

  @Get('media/:mediaId/moderation')
  @ApiParam({ name: 'mediaId', description: 'ID media', format: 'uuid' })
  @ApiOperation({ summary: 'Xem lịch sử moderation đã sanitize' })
  @ApiResponse({
    status: 200,
    description:
      'Lịch sử moderation đã loại bỏ token, lease ID và raw response',
    schema: {
      example: {
        mediaId: 'uuid',
        moderationStatus: 'FLAGGED',
        items: [
          {
            resultStatus: 'FLAGGED',
            reasonCode: 'SENSITIVE_CONTENT',
            summary: 'Nội dung cần quản lý xem xét.',
            checkedAt: '2026-07-11T00:00:00.000Z',
          },
        ],
      },
    },
  })
  @ResponseMessage('Lấy lịch sử moderation thành công')
  history(
    @Param('familyId') familyId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentFamilyMember() member: FamilyMember,
  ) {
    return this.moderation.history(familyId, mediaId, member);
  }

  @Patch('media/:mediaId/moderation')
  @FamilyRoles(FamilyRole.FAMILY_MANAGER, FamilyRole.DEPUTY_MEMBER)
  @ApiParam({ name: 'mediaId', description: 'ID media', format: 'uuid' })
  @ApiOperation({
    summary: 'Manager/Deputy review thủ công',
    description:
      'FLAGGED không xóa media. MARK_SAFE hoặc KEEP_FLAGGED là quyết định cuối của quản lý.',
  })
  @ApiResponse({ status: 200, description: 'Đã lưu manual review' })
  @ResponseMessage('Review moderation thành công')
  manualReview(
    @Param('familyId') familyId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentFamilyMember() member: FamilyMember,
    @Body() dto: ManualModerationReviewDto,
  ) {
    return this.moderation.manualReview(familyId, mediaId, member, dto);
  }

  @Post('media/:mediaId/moderation/retry')
  @Throttle({
    default: { limit: 5, ttl: 10 * 60_000, getTracker: albumMemberTracker },
  })
  @FamilyRoles(FamilyRole.FAMILY_MANAGER, FamilyRole.DEPUTY_MEMBER)
  @ApiParam({ name: 'mediaId', description: 'ID media', format: 'uuid' })
  @ApiOperation({
    summary: 'Tạo moderation job mới và enqueue lại',
    description:
      'Chỉ Manager/Deputy. PROCESSING phải quá stale timeout; mỗi retry tạo jobId mới.',
  })
  @ApiResponse({ status: 201, description: 'Đã tạo moderation job mới' })
  @ResponseMessage('Đã retry moderation')
  retry(
    @Param('familyId') familyId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentFamilyMember() member: FamilyMember,
  ) {
    return this.moderation.retry(familyId, mediaId, member);
  }
}
