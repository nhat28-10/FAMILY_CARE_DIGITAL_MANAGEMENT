import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { FamilyMember } from '@prisma/client';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentFamilyMember } from '../family-members/decorators/current-family-member.decorator';
import { FamilyPermissionGuard } from '../family-members/guards/family-permission.guard';
import { AlbumTagsService } from './album-tags.service';
import {
  AddAlbumMediaTagDto,
  AlbumTagApiResponseDto,
  AlbumTagListApiResponseDto,
  AlbumTagRemoveApiResponseDto,
} from './dto/album-tags.dto';

@ApiTags('Album Tags')
@ApiBearerAuth()
@ApiParam({ name: 'familyId', description: 'ID gia đình', format: 'uuid' })
@ApiParam({ name: 'mediaId', description: 'ID media', format: 'uuid' })
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/albums/media/:mediaId/tags')
export class AlbumTagsController {
  constructor(private readonly albumTagsService: AlbumTagsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Gắn thẻ thủ công một thành viên vào media',
    description:
      'Chỉ media SAFE. Thành viên được tag phải có sẵn quyền xem; tag không cấp thêm quyền truy cập.',
  })
  @ApiCreatedResponse({ type: AlbumTagApiResponseDto })
  @ResponseMessage('Gắn thẻ thành viên thành công')
  add(
    @Param('familyId') familyId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentFamilyMember() member: FamilyMember,
    @Body() dto: AddAlbumMediaTagDto,
  ) {
    return this.albumTagsService.add(familyId, mediaId, member, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách tag của media' })
  @ApiOkResponse({ type: AlbumTagListApiResponseDto })
  @ResponseMessage('Lấy danh sách tag thành công')
  list(
    @Param('familyId') familyId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentFamilyMember() member: FamilyMember,
  ) {
    return this.albumTagsService.list(familyId, mediaId, member);
  }

  @Delete(':tagId')
  @ApiParam({ name: 'tagId', description: 'ID tag', format: 'uuid' })
  @ApiOperation({ summary: 'Gỡ tag khỏi media' })
  @ApiOkResponse({ type: AlbumTagRemoveApiResponseDto })
  @ResponseMessage('Gỡ tag thành công')
  remove(
    @Param('familyId') familyId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @CurrentFamilyMember() member: FamilyMember,
  ) {
    return this.albumTagsService.remove(familyId, mediaId, tagId, member);
  }
}
