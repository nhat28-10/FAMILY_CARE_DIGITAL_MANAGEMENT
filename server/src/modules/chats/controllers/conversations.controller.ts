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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentFamilyMember } from '../../family-members/decorators/current-family-member.decorator';
import { FamilyPermissionGuard } from '../../family-members/guards/family-permission.guard';
import { AddParticipantsDto } from '../dto/add-participants.dto';
import { CreateConversationDto } from '../dto/create-conversation.dto';
import { UpdateConversationDto } from '../dto/update-conversation.dto';
import { ConversationsService } from '../services/conversations.service';
import type { CallerMember } from '../services/conversations.service';

@ApiTags('Chat')
@ApiBearerAuth()
@ApiParam({ name: 'familyId', description: 'ID của gia đình', format: 'uuid' })
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/chat/conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @ResponseMessage('Lấy danh sách hội thoại thành công')
  @ApiOperation({
    summary:
      'Danh sách hội thoại của tôi (kèm tin cuối + số tin chưa đọc; tự tạo/đồng bộ nhóm chat chung)',
  })
  list(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
  ) {
    return this.conversationsService.list(familyId, memberId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo hội thoại thành công')
  @ApiOperation({
    summary:
      'Tạo nhóm chat (GROUP) hoặc chat 1-1 (PRIVATE — trùng thì trả hội thoại cũ)',
  })
  create(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember() caller: CallerMember,
    @Body() dto: CreateConversationDto,
  ) {
    return this.conversationsService.create(familyId, caller, dto);
  }

  @Get(':conversationId')
  @ResponseMessage('Lấy chi tiết hội thoại thành công')
  @ApiOperation({ summary: 'Chi tiết hội thoại (kèm danh sách thành viên)' })
  getOne(
    @Param('familyId') familyId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentFamilyMember('id') memberId: string,
  ) {
    return this.conversationsService.getOne(familyId, conversationId, memberId);
  }

  @Patch(':conversationId')
  @ResponseMessage('Cập nhật hội thoại thành công')
  @ApiOperation({
    summary: 'Đổi tên / lưu trữ nhóm (người tạo hoặc quản lý gia đình)',
  })
  update(
    @Param('familyId') familyId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentFamilyMember() caller: CallerMember,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationsService.update(
      familyId,
      conversationId,
      caller,
      dto,
    );
  }

  @Post(':conversationId/participants')
  @ResponseMessage('Thêm thành viên vào nhóm thành công')
  @ApiOperation({ summary: 'Thêm thành viên vào nhóm chat' })
  addParticipants(
    @Param('familyId') familyId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: AddParticipantsDto,
  ) {
    return this.conversationsService.addParticipants(
      familyId,
      conversationId,
      memberId,
      dto,
    );
  }

  @Delete(':conversationId/participants/:memberId')
  @ResponseMessage('Đã xóa thành viên khỏi nhóm')
  @ApiOperation({
    summary: 'Xóa thành viên khỏi nhóm (người tạo hoặc quản lý gia đình)',
  })
  removeParticipant(
    @Param('familyId') familyId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('memberId') targetMemberId: string,
    @CurrentFamilyMember() caller: CallerMember,
  ) {
    return this.conversationsService.removeParticipant(
      familyId,
      conversationId,
      caller,
      targetMemberId,
    );
  }

  @Post(':conversationId/leave')
  @ResponseMessage('Đã rời nhóm chat')
  @ApiOperation({
    summary: 'Rời nhóm chat (không áp dụng nhóm chung / chat 1-1)',
  })
  leave(
    @Param('familyId') familyId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentFamilyMember('id') memberId: string,
  ) {
    return this.conversationsService.leave(familyId, conversationId, memberId);
  }

  @Post(':conversationId/read')
  @ResponseMessage('Đã đánh dấu đã đọc')
  @ApiOperation({ summary: 'Đánh dấu đã đọc hội thoại (read receipt)' })
  markRead(
    @Param('familyId') familyId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentFamilyMember('id') memberId: string,
  ) {
    return this.conversationsService.markRead(
      familyId,
      conversationId,
      memberId,
    );
  }

  @Get(':conversationId/pinned-messages')
  @ResponseMessage('Lấy danh sách tin nhắn đã ghim thành công')
  @ApiOperation({ summary: 'Danh sách tin nhắn đã ghim trong hội thoại' })
  listPinned(
    @Param('familyId') familyId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentFamilyMember('id') memberId: string,
  ) {
    return this.conversationsService.listPinnedMessages(
      familyId,
      conversationId,
      memberId,
    );
  }
}
