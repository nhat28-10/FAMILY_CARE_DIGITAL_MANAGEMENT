import { HttpException, Injectable, Logger } from '@nestjs/common';
import { AiRelatedModule, AiSenderType, Prisma } from '@prisma/client';
import type { FamilyMember } from '@prisma/client';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';

import { PrismaService } from '../../../prisma/prisma.service';
import type { SendAiMessageDto } from '../dto/send-ai-message.dto';
import { ToolRegistryService } from '../tools/tool-registry.service';
import {
  AiActionStatus,
  AiActionType,
  type AiPendingAction,
  type AiPermissionContext,
  type AiSendMessageResult,
  type AiToolContext,
  type AiToolTrace,
} from '../types/ai-chatbot.types';
import { AiConversationsService } from './ai-conversations.service';
import { OpenAiClientService } from './openai-client.service';

/** Giới hạn 1 message trong history đưa vào model (ký tự). */
const HISTORY_MESSAGE_MAX_CHARS = 4000;

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: AiConversationsService,
    private readonly openAiClient: OpenAiClientService,
    private readonly toolRegistry: ToolRegistryService,
  ) {}

  async sendMessage(
    familyId: string,
    member: FamilyMember,
    conversationId: string,
    dto: SendAiMessageDto,
  ): Promise<AiSendMessageResult> {
    const conversation = await this.conversations.getOwnedConversationOrThrow(
      familyId,
      member.id,
      conversationId,
    );
    await this.conversations.ensureTitle(conversation, dto.content);

    // Lưu tin nhắn người dùng TRƯỚC — OpenAI lỗi thì lịch sử vẫn còn để retry.
    const userMessage = await this.prisma.aIMessage.create({
      data: {
        aiConversationId: conversationId,
        senderType: AiSenderType.USER,
        messageContent: dto.content,
      },
    });

    const history = await this.loadHistory(conversationId, userMessage.id);
    const ctx: AiToolContext = {
      familyId,
      memberId: member.id,
      familyRole: member.familyRole,
    };

    const { finalText, toolTrace, pendingAction, modulesUsed } =
      await this.runAgentLoop(ctx, member, dto.content, history);

    const permissionContext: AiPermissionContext = {
      familyRole: member.familyRole,
      toolTrace,
      ...(pendingAction ? { pendingAction } : {}),
    };

    const aiMessage = await this.prisma.aIMessage.create({
      data: {
        aiConversationId: conversationId,
        senderType: AiSenderType.AI,
        messageContent: finalText,
        relatedModule: this.resolveRelatedModule(modulesUsed),
        permissionContext:
          permissionContext as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      userMessage: this.conversations.toMessageView(userMessage),
      aiMessage: this.conversations.toMessageView(aiMessage),
      pendingAction: pendingAction
        ? this.conversations.toPendingActionView(aiMessage.id, pendingAction)
        : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Agent loop
  // ---------------------------------------------------------------------------

  private async runAgentLoop(
    ctx: AiToolContext,
    member: FamilyMember,
    userContent: string,
    history: ChatCompletionMessageParam[],
  ): Promise<{
    finalText: string;
    toolTrace: AiToolTrace[];
    pendingAction?: AiPendingAction;
    modulesUsed: Set<AiRelatedModule>;
  }> {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: await this.buildSystemPrompt(ctx, member) },
      ...history,
      { role: 'user', content: userContent },
    ];
    const tools = this.toolRegistry.getOpenAiTools(ctx.familyRole);
    const toolTrace: AiToolTrace[] = [];
    const modulesUsed = new Set<AiRelatedModule>();
    let pendingAction: AiPendingAction | undefined;

    const maxRounds = this.openAiClient.config.maxToolRounds;
    for (let round = 0; round <= maxRounds; round++) {
      // Hết budget round (hoặc đã có đề xuất) → ép model trả lời bằng text.
      const forceText = round === maxRounds || pendingAction !== undefined;
      const completion = await this.openAiClient.chat(
        messages,
        tools,
        forceText ? 'none' : 'auto',
      );
      const choice = completion.choices[0]?.message;
      if (!choice) {
        return { finalText: this.fallbackText(), toolTrace, modulesUsed };
      }

      const toolCalls = (choice.tool_calls ?? []).filter(
        (call): call is ChatCompletionMessageToolCall & { type: 'function' } =>
          call.type === 'function',
      );
      if (toolCalls.length === 0) {
        return {
          finalText: choice.content?.trim() || this.fallbackText(),
          toolTrace,
          pendingAction,
          modulesUsed,
        };
      }

      messages.push(choice);
      for (const call of toolCalls) {
        const result = await this.handleToolCall(
          call,
          ctx,
          toolTrace,
          modulesUsed,
          pendingAction,
        );
        pendingAction = result.pendingAction ?? pendingAction;
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result.content,
        });
      }
    }

    return {
      finalText: this.fallbackText(),
      toolTrace,
      pendingAction,
      modulesUsed,
    };
  }

  private async handleToolCall(
    call: ChatCompletionMessageToolCall & { type: 'function' },
    ctx: AiToolContext,
    toolTrace: AiToolTrace[],
    modulesUsed: Set<AiRelatedModule>,
    existingAction: AiPendingAction | undefined,
  ): Promise<{ content: string; pendingAction?: AiPendingAction }> {
    const name = call.function.name;
    const tool = this.toolRegistry.getTool(name);
    const startedAt = Date.now();
    const pushTrace = (ok: boolean, args: Record<string, unknown> = {}) => {
      toolTrace.push({
        tool: name,
        args,
        ok,
        durationMs: Date.now() - startedAt,
      });
    };

    if (!tool) {
      pushTrace(false);
      return { content: JSON.stringify({ error: 'Công cụ không tồn tại' }) };
    }
    modulesUsed.add(tool.module);

    if (tool.kind === 'write') {
      // Hành động ghi KHÔNG thực thi — chỉ tạo đề xuất chờ user xác nhận.
      if (existingAction) {
        pushTrace(false);
        return {
          content: JSON.stringify({
            error: 'Chỉ một đề xuất hành động mỗi lượt',
          }),
        };
      }
      if (!tool.allowedRoles.includes(ctx.familyRole)) {
        pushTrace(false);
        return {
          content: JSON.stringify({
            error: 'Bạn không có quyền thực hiện hành động này',
          }),
        };
      }
      try {
        const args = call.function.arguments
          ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
          : {};
        const payload = await tool.buildActionPayload!(args, ctx);
        pushTrace(true, args);
        const expiresAt = new Date(
          Date.now() + this.openAiClient.config.actionExpiresMinutes * 60_000,
        ).toISOString();
        return {
          content: JSON.stringify({
            status: 'PROPOSED',
            message:
              'Đề xuất đã được tạo, chờ người dùng xác nhận trên ứng dụng.',
          }),
          pendingAction: {
            actionType: tool.actionType as AiActionType,
            payload,
            status: AiActionStatus.PENDING,
            proposedByMemberId: ctx.memberId,
            expiresAt,
          },
        };
      } catch (error) {
        pushTrace(false);
        const message =
          error instanceof HttpException
            ? error.message
            : 'Tham số đề xuất không hợp lệ';
        return { content: JSON.stringify({ error: message }) };
      }
    }

    const result = await this.toolRegistry.executeReadTool(
      name,
      call.function.arguments ?? '',
      ctx,
    );
    pushTrace(result.ok);
    return { content: result.content };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async loadHistory(
    conversationId: string,
    excludeMessageId: string,
  ): Promise<ChatCompletionMessageParam[]> {
    const rows = await this.prisma.aIMessage.findMany({
      where: {
        aiConversationId: conversationId,
        id: { not: excludeMessageId },
      },
      orderBy: { createdAt: 'desc' },
      take: this.openAiClient.config.maxHistoryMessages,
    });
    return rows.reverse().map((row) => ({
      role: row.senderType === AiSenderType.USER ? 'user' : 'assistant',
      content:
        row.messageContent.length > HISTORY_MESSAGE_MAX_CHARS
          ? `${row.messageContent.slice(0, HISTORY_MESSAGE_MAX_CHARS)}…`
          : row.messageContent,
    }));
  }

  private async buildSystemPrompt(
    ctx: AiToolContext,
    member: FamilyMember,
  ): Promise<string> {
    const family = await this.prisma.family.findUnique({
      where: { id: ctx.familyId },
      select: { name: true },
    });
    const today = new Date().toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    return [
      'Bạn là trợ lý AI của ứng dụng Family Care — nền tảng quản lý tài chính và chăm sóc gia đình.',
      `Gia đình hiện tại: "${family?.name ?? 'Gia đình'}". Người đang trò chuyện: ${member.displayName ?? 'thành viên'} (vai trò ${member.familyRole}).`,
      `Hôm nay là ${today} (múi giờ Việt Nam). Đơn vị tiền tệ mặc định là VND.`,
      'Quy tắc:',
      '- Luôn trả lời bằng tiếng Việt, thân thiện và ngắn gọn.',
      '- Số liệu về gia đình CHỈ được lấy từ kết quả tools — tuyệt đối không bịa.',
      '- Hành động ghi (tạo giao dịch, tạo công việc) chỉ là ĐỀ XUẤT: sau khi gọi tool propose_*, hãy tóm tắt đề xuất và nhắc người dùng bấm xác nhận trên ứng dụng.',
      '- Các trường như danh mục (categoryId), hũ (jarId), người được giao là TÙY CHỌN. Nếu danh sách trả về rỗng, không tìm thấy mục khớp, hoặc người dùng không nêu, cứ tạo đề xuất và BỎ TRỐNG các trường đó — tuyệt đối không từ chối hay đòi hỏi thêm thông tin không bắt buộc.',
      '- Nếu tool trả về lỗi thiếu quyền, giải thích lịch sự rằng tài khoản không có quyền xem/làm việc đó.',
      '- Câu hỏi ngoài phạm vi gia đình (kiến thức chung về tài chính, nuôi dạy con...) có thể trả lời ngắn gọn, thêm lưu ý đây là thông tin tham khảo.',
    ].join('\n');
  }

  private resolveRelatedModule(
    modulesUsed: Set<AiRelatedModule>,
  ): AiRelatedModule {
    if (modulesUsed.size === 1) {
      return [...modulesUsed][0];
    }
    return AiRelatedModule.GENERAL;
  }

  private fallbackText(): string {
    return 'Xin lỗi, tôi chưa thể trả lời câu hỏi này. Bạn thử diễn đạt lại giúp mình nhé.';
  }
}
