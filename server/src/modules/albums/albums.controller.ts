import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { FamilyMember } from '@prisma/client';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentFamilyMember } from '../family-members/decorators/current-family-member.decorator';
import { FamilyPermissionGuard } from '../family-members/guards/family-permission.guard';
import type { UploadedFilePayload } from '../storage/storage.service';
import { ALBUM_MAX_FILE_SIZE } from './album-media.validator';
import { AlbumsService } from './albums.service';
import { albumMemberTracker } from './album-throttle';
import {
  AnalyzeAlbumDraftDto,
  ListAlbumMediaQueryDto,
  PermanentDeleteAlbumMediaDto,
  SoftDeleteAlbumMediaDto,
  UpdateAlbumMediaDto,
  UploadAlbumMediaDto,
} from './dto/album-media.dto';

@ApiTags('Albums')
@ApiBearerAuth()
@ApiParam({ name: 'familyId', description: 'ID gia đình', format: 'uuid' })
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/albums/media')
export class AlbumsController {
  constructor(private readonly albumsService: AlbumsService) {}

  @Post('analyze-draft')
  @Throttle({
    default: { limit: 20, ttl: 60_000, getTracker: albumMemberTracker },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: ALBUM_MAX_FILE_SIZE } }),
  )
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Phân tích nháp media trước upload album',
    description:
      'Không lưu DB, không upload R2, không gọi face-scan. Endpoint chỉ cảnh báo mềm về ảnh không có người hoặc không khớp chủ đề collection.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        collectionId: { type: 'string', format: 'uuid' },
        topic: { type: 'string', maxLength: 120 },
        declaredContentIntent: {
          type: 'string',
          enum: ['PEOPLE', 'SCENE_OR_OBJECT'],
        },
      },
    },
  })
  @ResponseMessage('Phân tích nháp album thành công')
  analyzeDraft(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember() member: FamilyMember,
    @Body() dto: AnalyzeAlbumDraftDto,
    @UploadedFile() file: UploadedFilePayload | undefined,
  ) {
    return this.albumsService.analyzeDraft(familyId, member, dto, file);
  }

  @Post()
  @Throttle({
    default: { limit: 10, ttl: 60_000, getTracker: albumMemberTracker },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: ALBUM_MAX_FILE_SIZE } }),
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Tải một ảnh/video lên album private R2',
    description:
      'Một file/request. Ảnh JPEG/PNG/WebP tối đa 10MB; MP4 tối đa 20MB. MIME phải khớp magic bytes. Media mới luôn PENDING và AI không tự xóa media.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        collectionId: { type: 'string', format: 'uuid' },
        caption: { type: 'string', maxLength: 1000 },
        visibilityScope: {
          type: 'string',
          enum: ['FAMILY', 'PRIVATE', 'MANAGER_ONLY'],
          default: 'FAMILY',
        },
      },
    },
  })
  @ResponseMessage('Tải media lên album thành công')
  upload(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember() member: FamilyMember,
    @Body() dto: UploadAlbumMediaDto,
    @UploadedFile() file: UploadedFilePayload | undefined,
  ) {
    return this.albumsService.upload(familyId, member, dto, file);
  }

  @Get()
  @ApiOperation({
    summary: 'Danh sách media album có filter và pagination',
    description:
      'Filter chạy tại database. Tag thủ công không cấp thêm quyền xem. List không ký URL original cho từng item; dùng detail để nhận signed URL có thời hạn.',
  })
  @ResponseMessage('Lấy danh sách media album thành công')
  list(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember() member: FamilyMember,
    @Query() query: ListAlbumMediaQueryDto,
  ) {
    return this.albumsService.list(familyId, member, query);
  }

  @Get(':mediaId')
  @ApiParam({ name: 'mediaId', description: 'ID media', format: 'uuid' })
  @ApiOperation({
    summary: 'Xem chi tiết media đang hoạt động',
    description:
      'fileAccess chỉ xuất hiện khi policy cho phép và signed URL có thời hạn.',
  })
  @ResponseMessage('Lấy chi tiết media thành công')
  detail(
    @Param('familyId') familyId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentFamilyMember() member: FamilyMember,
  ) {
    return this.albumsService.detail(familyId, mediaId, member);
  }

  @Patch(':mediaId')
  @ApiParam({ name: 'mediaId', description: 'ID media', format: 'uuid' })
  @ApiOperation({ summary: 'Cập nhật caption hoặc visibility (chỉ uploader)' })
  @ResponseMessage('Cập nhật media thành công')
  update(
    @Param('familyId') familyId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentFamilyMember() member: FamilyMember,
    @Body() dto: UpdateAlbumMediaDto,
  ) {
    return this.albumsService.update(familyId, mediaId, member, dto);
  }

  @Delete(':mediaId')
  @ApiParam({ name: 'mediaId', description: 'ID media', format: 'uuid' })
  @ApiOperation({
    summary: 'Xóa mềm media',
    description: 'Không xóa object R2, tag hoặc lịch sử moderation.',
  })
  @ResponseMessage('Xóa media thành công')
  softDelete(
    @Param('familyId') familyId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentFamilyMember() member: FamilyMember,
    @Body() dto: SoftDeleteAlbumMediaDto,
  ) {
    return this.albumsService.softDelete(familyId, mediaId, member, dto ?? {});
  }

  @Post(':mediaId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'mediaId', description: 'ID media', format: 'uuid' })
  @ApiOperation({ summary: 'Khôi phục media đã xóa mềm' })
  @ResponseMessage('Khôi phục media thành công')
  restore(
    @Param('familyId') familyId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentFamilyMember() member: FamilyMember,
  ) {
    return this.albumsService.restore(familyId, mediaId, member);
  }

  @Delete(':mediaId/permanent')
  @Throttle({
    default: { limit: 10, ttl: 60_000, getTracker: albumMemberTracker },
  })
  @ApiParam({ name: 'mediaId', description: 'ID media', format: 'uuid' })
  @ApiOperation({
    summary: 'Xóa vĩnh viễn media đã soft-delete và object private R2',
    description:
      'Yêu cầu soft delete trước và body confirmation=PERMANENT_DELETE. R2 được xóa trước DB; lỗi được ghi cleanup job để retry an toàn.',
  })
  @ResponseMessage('Xóa vĩnh viễn media thành công')
  permanentDelete(
    @Param('familyId') familyId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentFamilyMember() member: FamilyMember,
    @Body() _dto: PermanentDeleteAlbumMediaDto,
  ) {
    return this.albumsService.permanentDelete(familyId, mediaId, member);
  }
}
