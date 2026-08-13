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
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentFamilyMember } from '../../family-members/decorators/current-family-member.decorator';
import { FamilyPermissionGuard } from '../../family-members/guards/family-permission.guard';
import type { UploadedFilePayload } from '../../storage/storage.service';
import { EditMessageDto } from '../dto/edit-message.dto';
import { ListMessagesQueryDto } from '../dto/list-messages-query.dto';
import { ReactMessageDto } from '../dto/react-message.dto';
import { SendMessageDto } from '../dto/send-message.dto';
import { MessagesService } from '../services/messages.service';
import type { CallerMember } from '../services/conversations.service';

@ApiTags('Chat')
@ApiBearerAuth()
@ApiParam({ name: 'familyId', description: 'ID của gia đình', format: 'uuid' })
@ApiParam({
  name: 'conversationId',
  description: 'ID hội thoại',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/chat/conversations/:conversationId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @ResponseMessage('Lấy tin nhắn thành công')
  @ApiOperation({
    summary: 'Lịch sử tin nhắn (cursor pagination mới → cũ; ?q= để tìm kiếm)',
  })
  list(
    @Param('familyId') familyId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.messagesService.list(familyId, conversationId, memberId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Gửi tin nhắn thành công')
  @ApiOperation({ summary: 'Gửi tin nhắn (văn bản / đính kèm / reply)' })
  send(
    @Param('familyId') familyId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.send(familyId, conversationId, memberId, dto);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tải file lên thành công')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Tải file đính kèm lên R2 — nhận fileUrl để gửi kèm tin nhắn',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  upload(
    @Param('familyId') familyId: string,
    @UploadedFile() file: UploadedFilePayload | undefined,
  ) {
    return this.messagesService.uploadAttachment(familyId, file);
  }

  @Patch(':messageId')
  @ResponseMessage('Sửa tin nhắn thành công')
  @ApiOperation({ summary: 'Sửa tin nhắn văn bản (chỉ người gửi)' })
  edit(
    @Param('familyId') familyId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.messagesService.edit(
      familyId,
      conversationId,
      memberId,
      messageId,
      dto,
    );
  }

  @Delete(':messageId')
  @ResponseMessage('Đã thu hồi tin nhắn')
  @ApiOperation({
    summary: 'Thu hồi tin nhắn (người gửi hoặc quản lý gia đình)',
  })
  remove(
    @Param('familyId') familyId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentFamilyMember() caller: CallerMember,
  ) {
    return this.messagesService.remove(
      familyId,
      conversationId,
      caller,
      messageId,
    );
  }

  @Post(':messageId/reactions')
  @ResponseMessage('Đã thả cảm xúc')
  @ApiOperation({ summary: 'Thả cảm xúc (reaction) cho tin nhắn' })
  react(
    @Param('familyId') familyId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: ReactMessageDto,
  ) {
    return this.messagesService.react(
      familyId,
      conversationId,
      memberId,
      messageId,
      dto,
    );
  }

  @Delete(':messageId/reactions/:emoji')
  @ResponseMessage('Đã bỏ cảm xúc')
  @ApiOperation({ summary: 'Bỏ cảm xúc của chính mình khỏi tin nhắn' })
  unreact(
    @Param('familyId') familyId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Param('emoji') emoji: string,
    @CurrentFamilyMember('id') memberId: string,
  ) {
    return this.messagesService.unreact(
      familyId,
      conversationId,
      memberId,
      messageId,
      emoji,
    );
  }

  @Post(':messageId/pin')
  @ResponseMessage('Đã ghim tin nhắn')
  @ApiOperation({ summary: 'Ghim tin nhắn trong hội thoại' })
  pin(
    @Param('familyId') familyId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentFamilyMember('id') memberId: string,
  ) {
    return this.messagesService.pin(
      familyId,
      conversationId,
      memberId,
      messageId,
    );
  }

  @Delete(':messageId/pin')
  @ResponseMessage('Đã bỏ ghim tin nhắn')
  @ApiOperation({ summary: 'Bỏ ghim tin nhắn' })
  unpin(
    @Param('familyId') familyId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentFamilyMember('id') memberId: string,
  ) {
    return this.messagesService.unpin(
      familyId,
      conversationId,
      memberId,
      messageId,
    );
  }
}
