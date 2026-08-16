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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { FamilyMember } from '@prisma/client';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentFamilyMember } from '../family-members/decorators/current-family-member.decorator';
import { FamilyPermissionGuard } from '../family-members/guards/family-permission.guard';
import { AlbumCollectionsService } from './album-collections.service';
import {
  CreateAlbumCollectionDto,
  ListAlbumCollectionsQueryDto,
  UpdateAlbumCollectionDto,
} from './dto/album-collection.dto';

@ApiTags('Album Collections')
@ApiBearerAuth()
@ApiParam({ name: 'familyId', description: 'ID gia đình', format: 'uuid' })
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/albums/collections')
export class AlbumCollectionsController {
  constructor(private readonly collections: AlbumCollectionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo album/collection ảnh gia đình' })
  @ResponseMessage('Tạo album thành công')
  create(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember() member: FamilyMember,
    @Body() dto: CreateAlbumCollectionDto,
  ) {
    return this.collections.create(familyId, member, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách album/collection ảnh gia đình' })
  @ResponseMessage('Lấy danh sách album thành công')
  list(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember() member: FamilyMember,
    @Query() query: ListAlbumCollectionsQueryDto,
  ) {
    return this.collections.list(familyId, member, query);
  }

  @Get(':collectionId')
  @ApiParam({ name: 'collectionId', description: 'ID album', format: 'uuid' })
  @ApiOperation({ summary: 'Chi tiết album/collection ảnh gia đình' })
  @ResponseMessage('Lấy chi tiết album thành công')
  detail(
    @Param('familyId') familyId: string,
    @Param('collectionId', ParseUUIDPipe) collectionId: string,
    @CurrentFamilyMember() member: FamilyMember,
  ) {
    return this.collections.detail(familyId, collectionId, member);
  }

  @Patch(':collectionId')
  @ApiParam({ name: 'collectionId', description: 'ID album', format: 'uuid' })
  @ApiOperation({ summary: 'Cập nhật album/collection ảnh gia đình' })
  @ResponseMessage('Cập nhật album thành công')
  update(
    @Param('familyId') familyId: string,
    @Param('collectionId', ParseUUIDPipe) collectionId: string,
    @CurrentFamilyMember() member: FamilyMember,
    @Body() dto: UpdateAlbumCollectionDto,
  ) {
    return this.collections.update(familyId, collectionId, member, dto);
  }

  @Delete(':collectionId')
  @ApiParam({ name: 'collectionId', description: 'ID album', format: 'uuid' })
  @ApiOperation({
    summary: 'Xóa mềm album/collection',
    description:
      'Chỉ xóa collection. Media đã upload vẫn còn và collectionId được giữ để audit.',
  })
  @ResponseMessage('Xóa album thành công')
  delete(
    @Param('familyId') familyId: string,
    @Param('collectionId', ParseUUIDPipe) collectionId: string,
    @CurrentFamilyMember() member: FamilyMember,
  ) {
    return this.collections.softDelete(familyId, collectionId, member);
  }
}
