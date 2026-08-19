import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FamilyMember } from '@prisma/client';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentFamilyMember } from '../family-members/decorators/current-family-member.decorator';
import { FamilyPermissionGuard } from '../family-members/guards/family-permission.guard';
import { albumMemberTracker } from './album-throttle';
import { AlbumFaceSuggestionsService } from './album-face-suggestions.service';
import {
  FACE_SUGGESTIONS_RESPONSE_EXAMPLE,
  FaceSuggestionsApiResponseDto,
  FaceScanJobSummaryApiResponseDto,
  RequestFaceScanDto,
} from './dto/album-face-suggestions.dto';

@ApiTags('Album Face Suggestions')
@ApiBearerAuth()
@ApiParam({ name: 'familyId', description: 'ID gia đình', format: 'uuid' })
@ApiParam({ name: 'mediaId', description: 'ID media', format: 'uuid' })
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/albums/media/:mediaId')
export class AlbumFaceSuggestionsController {
  constructor(private readonly faceSuggestions: AlbumFaceSuggestionsService) {}

  @Post('face-scan')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({
    default: { limit: 5, ttl: 600_000, getTracker: albumMemberTracker },
  })
  @ApiOperation({ summary: 'Yêu cầu quét khuôn mặt trong ảnh album' })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description:
      'Force rescan rate limit. Body includes errorCode/code=FACE_SCAN_FORCE_RESCAN_RATE_LIMITED, retryAfterSeconds, cooldownSeconds; header Retry-After mirrors retryAfterSeconds.',
  })
  @ApiAcceptedResponse({ type: FaceScanJobSummaryApiResponseDto })
  @ResponseMessage('Đã tạo hoặc trả về face scan job hiện có')
  requestScan(
    @Param('familyId') familyId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentFamilyMember() member: FamilyMember,
    @Body() dto: RequestFaceScanDto = {},
  ) {
    return this.faceSuggestions.requestScan(familyId, mediaId, member, dto);
  }

  @Post('face-scan/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({
    default: { limit: 5, ttl: 600_000, getTracker: albumMemberTracker },
  })
  @ApiOperation({
    summary: 'Retry face scan job đã FAILED hoặc bị kẹt quá timeout',
    description:
      'Dùng khi GET face-scan trả retryAllowed=true. Job PROCESSING/PENDING chỉ được retry sau maxProcessingSeconds.',
  })
  @ApiAcceptedResponse({ type: FaceScanJobSummaryApiResponseDto })
  @ResponseMessage('Đã retry face scan job')
  retryScan(
    @Param('familyId') familyId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentFamilyMember() member: FamilyMember,
  ) {
    return this.faceSuggestions.retryScan(familyId, mediaId, member);
  }

  @Get('face-scan')
  @ApiOperation({ summary: 'Xem trạng thái face scan của media' })
  @ApiOkResponse({ type: FaceScanJobSummaryApiResponseDto })
  @ResponseMessage('Lấy trạng thái face scan thành công')
  getScanStatus(
    @Param('familyId') familyId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentFamilyMember() member: FamilyMember,
  ) {
    return this.faceSuggestions.getScanStatus(familyId, mediaId, member);
  }

  @Get('face-suggestions')
  @ApiOperation({ summary: 'Danh sách đề xuất tag từ face scan' })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Envelope chuan. data.faces la contract chinh cho anh nhieu khuon mat: moi face co candidates[] rieng; candidates=[] nghia la detected nhung khong match. BE chi tao suggestion, user confirm moi tao tag chinh thuc. data.items la flat list cu de tuong thich.',
    type: FaceSuggestionsApiResponseDto,
    examples: {
      multiFace: {
        summary: 'Multi-face suggestion response',
        value: FACE_SUGGESTIONS_RESPONSE_EXAMPLE,
      },
    },
  })
  @ResponseMessage('Lấy danh sách đề xuất tag thành công')
  listSuggestions(
    @Param('familyId') familyId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentFamilyMember() member: FamilyMember,
  ) {
    return this.faceSuggestions.listSuggestions(familyId, mediaId, member);
  }

  @Post('face-suggestions/:suggestionId/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: 30, ttl: 60_000, getTracker: albumMemberTracker },
  })
  @ApiParam({ name: 'suggestionId', description: 'ID đề xuất', format: 'uuid' })
  @ApiOperation({ summary: 'Xác nhận đề xuất tag từ face scan' })
  @ResponseMessage('Xác nhận đề xuất tag thành công')
  confirmSuggestion(
    @Param('familyId') familyId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Param('suggestionId', ParseUUIDPipe) suggestionId: string,
    @CurrentFamilyMember() member: FamilyMember,
  ) {
    return this.faceSuggestions.confirmSuggestion(
      familyId,
      mediaId,
      suggestionId,
      member,
    );
  }

  @Post('face-suggestions/:suggestionId/reject')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: 30, ttl: 60_000, getTracker: albumMemberTracker },
  })
  @ApiParam({ name: 'suggestionId', description: 'ID đề xuất', format: 'uuid' })
  @ApiOperation({ summary: 'Từ chối đề xuất tag từ face scan' })
  @ResponseMessage('Từ chối đề xuất tag thành công')
  rejectSuggestion(
    @Param('familyId') familyId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Param('suggestionId', ParseUUIDPipe) suggestionId: string,
    @CurrentFamilyMember() member: FamilyMember,
  ) {
    return this.faceSuggestions.rejectSuggestion(
      familyId,
      mediaId,
      suggestionId,
      member,
    );
  }
}
