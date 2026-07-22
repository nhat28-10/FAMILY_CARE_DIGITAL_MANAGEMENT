import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import type { FamilyMember } from '@prisma/client';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { VerifiedGuard } from '../../auth/guards/verified.guard';
import { CurrentFamilyMember } from '../../family-members/decorators/current-family-member.decorator';
import { FamilyPermissionGuard } from '../../family-members/guards/family-permission.guard';
import { AiMessageQueryDto } from '../dto/ai-message-query.dto';
import { CreateAiConversationDto } from '../dto/create-ai-conversation.dto';
import { SendAiMessageDto } from '../dto/send-ai-message.dto';
import { AiActionsService } from '../services/ai-actions.service';
import { AiChatService } from '../services/ai-chat.service';
import { AiConversationsService } from '../services/ai-conversations.service';

@ApiTags('AI Chatbot - Trợ lý gia đình')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/ai-chatbot')
export class AiChatbotController {
  constructor(
    private readonly conversationsService: AiConversationsService,
    private readonly chatService: AiChatService,
    private readonly actionsService: AiActionsService,
  ) {}

  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo cuộc trò chuyện với trợ lý AI thành công')
  @ApiOperation({ summary: 'Tạo cuộc trò chuyện mới với trợ lý AI' })
  createConversation(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateAiConversationDto,
  ) {
    return this.conversationsService.create(familyId, memberId, dto.title);
  }

  @Get('conversations')
  @ResponseMessage('Lấy danh sách cuộc trò chuyện AI thành công')
  @ApiOperation({
    summary: 'Danh sách cuộc trò chuyện AI của chính thành viên hiện tại',
  })
  listConversations(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() query: AiMessageQueryDto,
  ) {
    return this.conversationsService.listByMember(
      familyId,
      memberId,
      query.page,
      query.limit,
    );
  }

  @Get('conversations/:conversationId/messages')
  @ResponseMessage('Lấy lịch sử trò chuyện AI thành công')
  @ApiOperation({ summary: 'Lịch sử tin nhắn của một cuộc trò chuyện AI' })
  @ApiParam({ name: 'conversationId', format: 'uuid' })
  listMessages(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('conversationId') conversationId: string,
    @Query() query: AiMessageQueryDto,
  ) {
    return this.conversationsService.listMessages(
      familyId,
      memberId,
      conversationId,
      query,
    );
  }

  @Post('conversations/:conversationId/messages')
  @HttpCode(HttpStatus.OK)
  // Mỗi lượt chat là 1 call OpenAI tốn phí — siết riêng chặt hơn throttle global.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ResponseMessage('Trợ lý AI đã phản hồi')
  @ApiOperation({
    summary: 'Gửi tin nhắn cho trợ lý AI và nhận câu trả lời',
    description:
      'AI có thể tra cứu dữ liệu gia đình theo quyền của người hỏi. Nếu AI đề xuất hành động ghi, response chứa `pendingAction` — client gọi confirm-action để thực hiện.',
  })
  @ApiParam({ name: 'conversationId', format: 'uuid' })
  @ApiResponse({ status: 502, description: 'Trợ lý AI không phản hồi' })
  @ApiResponse({ status: 503, description: 'Trợ lý AI chưa được cấu hình' })
  sendMessage(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember() member: FamilyMember,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendAiMessageDto,
  ) {
    return this.chatService.sendMessage(familyId, member, conversationId, dto);
  }

  @Post('conversations/:conversationId/messages/:messageId/confirm-action')
  @UseGuards(VerifiedGuard)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Đã xác nhận và thực hiện hành động')
  @ApiOperation({
    summary: 'Xác nhận đề xuất hành động của AI (tạo giao dịch/công việc)',
  })
  @ApiParam({ name: 'conversationId', format: 'uuid' })
  @ApiParam({ name: 'messageId', format: 'uuid' })
  @ApiResponse({ status: 409, description: 'Đề xuất đã được xử lý' })
  @ApiResponse({ status: 410, description: 'Đề xuất đã hết hạn' })
  confirmAction(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember() member: FamilyMember,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.actionsService.confirm(
      familyId,
      member,
      conversationId,
      messageId,
    );
  }

  @Post('conversations/:conversationId/messages/:messageId/reject-action')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Đã hủy đề xuất hành động')
  @ApiOperation({ summary: 'Từ chối đề xuất hành động của AI' })
  @ApiParam({ name: 'conversationId', format: 'uuid' })
  @ApiParam({ name: 'messageId', format: 'uuid' })
  rejectAction(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember() member: FamilyMember,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.actionsService.reject(
      familyId,
      member,
      conversationId,
      messageId,
    );
  }

  @Delete('conversations/:conversationId')
  @ResponseMessage('Xóa cuộc trò chuyện AI thành công')
  @ApiOperation({
    summary: 'Xóa một cuộc trò chuyện AI (kèm toàn bộ tin nhắn)',
  })
  @ApiParam({ name: 'conversationId', format: 'uuid' })
  deleteConversation(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.conversationsService.delete(familyId, memberId, conversationId);
  }
}
