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
const MAX_PENDING_ACTIONS_PER_MESSAGE = 5;

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

    const { finalText, toolTrace, pendingActions, modulesUsed } =
      await this.runAgentLoop(ctx, member, dto.content, history);
    const pendingAction = pendingActions[0];

    const permissionContext: AiPermissionContext = {
      familyRole: member.familyRole,
      toolTrace,
      ...(pendingActions.length > 0 ? { pendingActions } : {}),
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
      pendingActions: pendingActions.map((action, index) =>
        this.conversations.toPendingActionView(aiMessage.id, action, index),
      ),
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
    pendingActions: AiPendingAction[];
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
    const pendingActions: AiPendingAction[] = [];
    let deniedWriteAction: AiActionType | undefined;

    const maxRounds = this.openAiClient.config.maxToolRounds;
    for (let round = 0; round <= maxRounds; round++) {
      // Hết budget round (hoặc đã có đề xuất) → ép model trả lời bằng text.
      const forceText = round === maxRounds || pendingActions.length > 0;
      const completion = await this.openAiClient.chat(
        messages,
        tools,
        forceText ? 'none' : 'auto',
      );
      const choice = completion.choices[0]?.message;
      if (!choice) {
        return {
          finalText: this.fallbackText(),
          toolTrace,
          pendingActions,
          modulesUsed,
        };
      }

      const toolCalls = (choice.tool_calls ?? []).filter(
        (call): call is ChatCompletionMessageToolCall & { type: 'function' } =>
          call.type === 'function',
      );
      if (toolCalls.length === 0) {
        if (pendingActions.length === 0 && deniedWriteAction) {
          return {
            finalText: this.writePermissionText(deniedWriteAction),
            toolTrace,
            pendingActions,
            modulesUsed,
          };
        }
        return {
          finalText: choice.content?.trim() || this.fallbackText(),
          toolTrace,
          pendingActions,
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
          pendingActions,
        );
        if (result.pendingAction) {
          pendingActions.push(result.pendingAction);
        }
        deniedWriteAction = result.deniedActionType ?? deniedWriteAction;
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result.content,
        });
      }
    }

    return {
      finalText:
        pendingActions.length === 0 && deniedWriteAction
          ? this.writePermissionText(deniedWriteAction)
          : this.fallbackText(),
      toolTrace,
      pendingActions,
      modulesUsed,
    };
  }

  private async handleToolCall(
    call: ChatCompletionMessageToolCall & { type: 'function' },
    ctx: AiToolContext,
    toolTrace: AiToolTrace[],
    modulesUsed: Set<AiRelatedModule>,
    existingActions: AiPendingAction[],
  ): Promise<{
    content: string;
    pendingAction?: AiPendingAction;
    deniedActionType?: AiActionType;
  }> {
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
      if (existingActions.length >= MAX_PENDING_ACTIONS_PER_MESSAGE) {
        pushTrace(false);
        return {
          content: JSON.stringify({
            error: `Chỉ tối đa ${MAX_PENDING_ACTIONS_PER_MESSAGE} đề xuất hành động mỗi lượt`,
          }),
        };
      }
      if (!tool.allowedRoles.includes(ctx.familyRole)) {
        pushTrace(false);
        return {
          content: JSON.stringify({
            error: 'Bạn không có quyền thực hiện hành động này',
          }),
          deniedActionType: tool.actionType as AiActionType,
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
      '- Khi có dữ liệu từ tool, trả lời theo cấu trúc rõ ràng: "Nhận định", "Đề xuất", "Bước tiếp theo". Không viết một đoạn dài liền mạch.',
      '- Khi người dùng hỏi "hôm nay có gì", "tổng quan hôm nay", "việc quan trọng", "nhắc tôi", "daily brief" hoặc muốn trợ lý chủ động rà soát ngày hôm nay, hãy dùng get_daily_brief. Sau đó trả lời theo các mục: "Tổng quan hôm nay", "Điểm cần chú ý", "Gợi ý tiếp theo".',
      '- Với đề xuất hành động, hãy nói rõ đây là bản nháp, nêu 2-4 trường quan trọng, rồi hỏi người dùng xác nhận trên ứng dụng. Không nói như thể đã thực hiện xong.',
      '- Nếu chỉ tư vấn chung, đưa tối đa 3 gợi ý có thể làm ngay. Nếu thiếu dữ liệu, nói rõ mức độ chắc chắn thay vì phán đoán.',
      '- Số liệu về gia đình CHỈ được lấy từ kết quả tools — tuyệt đối không bịa.',
      '- Hành động ghi (tạo giao dịch, tạo công việc) chỉ là ĐỀ XUẤT: sau khi gọi tool propose_*, hãy tóm tắt đề xuất và nhắc người dùng bấm xác nhận trên ứng dụng.',
      '- Nếu yêu cầu của người dùng cần một kế hoạch nhiều bước, có thể gọi nhiều tool propose_* trong cùng một lượt (tối đa 5). Khi đã có nhiều đề xuất, hãy trình bày như một kế hoạch theo thứ tự bước rõ ràng và nhắc người dùng xác nhận từng bước trên ứng dụng.',
      '- Khi người dùng yêu cầu tạo lịch/hẹn/sự kiện, dùng propose_create_calendar_event; tạo công việc thì dùng propose_create_task; ghi thu/chi thì dùng propose_create_ledger_entry; lập ngân sách/kế hoạch chi tiêu thì dùng propose_create_budget_plan; thêm dòng ngân sách vào kế hoạch có sẵn thì dùng propose_create_budget_line; tạo mục tiêu tiết kiệm/mục tiêu tài chính thì dùng propose_create_financial_goal; phân bổ tiền vào mục tiêu thì dùng propose_create_goal_allocation; lập kế hoạch đóng góp mục tiêu cho thành viên thì dùng propose_create_goal_contribution_plan; chia quỹ theo mô hình hũ thì dùng propose_allocate_fund_by_model.',
      '- Với lịch sự kiện, hãy quy đổi các cụm như "ngày mai", "tối nay", "thứ 2 tuần sau" sang ISO datetime có timezone theo múi giờ Việt Nam trước khi đề xuất.',
      '- Với ghi thu/chi, nếu có danh mục tài chính phù hợp rõ ràng với nội dung giao dịch, hãy dùng list_finance_categories để lấy categoryId trước khi gọi propose_create_ledger_entry. Nếu không có danh mục khớp rõ thì vẫn tạo đề xuất và bỏ trống categoryId.',
      '- Các trường như danh mục (categoryId), hũ (jarId), người được giao là TÙY CHỌN. Nếu danh sách trả về rỗng, không tìm thấy mục khớp, hoặc người dùng không nêu, cứ tạo đề xuất và BỎ TRỐNG các trường đó — tuyệt đối không từ chối hay đòi hỏi thêm thông tin không bắt buộc.',
      '- Nếu tool trả về lỗi thiếu quyền, giải thích lịch sự rằng tài khoản không có quyền xem/làm việc đó.',
      '- Câu hỏi ngoài phạm vi gia đình (kiến thức chung về tài chính, nuôi dạy con...) có thể trả lời ngắn gọn, thêm lưu ý đây là thông tin tham khảo.',
      '- Nếu tool propose_* trả lời thiếu quyền hoặc không tạo được đề xuất, TUYỆT ĐỐI không nói người dùng bấm xác nhận trên ứng dụng.',
      '- Với FAMILY_MEMBER, khi nói về dữ liệu tài chính cá nhân hãy dùng "bạn"; chỉ dùng "gia đình/nhà mình" khi tool trả về dữ liệu phạm vi gia đình.',
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
  private writePermissionText(actionType: AiActionType): string {
    switch (actionType) {
      case AiActionType.CREATE_LEDGER_ENTRY:
        return 'Bạn không có quyền ghi khoản thu/chi vào sổ chung. Hãy nhờ Trưởng nhóm hoặc Phó nhóm thực hiện giúp bạn.';
      case AiActionType.CREATE_BUDGET_PLAN:
        return 'Bạn không có quyền tạo kế hoạch ngân sách gia đình. Hãy nhờ Trưởng nhóm hoặc Phó nhóm thực hiện giúp bạn.';
      case AiActionType.CREATE_BUDGET_LINE:
        return 'Bạn không có quyền thêm dòng ngân sách gia đình. Hãy nhờ Trưởng nhóm hoặc Phó nhóm thực hiện giúp bạn.';
      case AiActionType.CREATE_FINANCIAL_GOAL:
        return 'Bạn không có quyền tạo mục tiêu tài chính gia đình. Hãy nhờ Trưởng nhóm hoặc Phó nhóm thực hiện giúp bạn.';
      case AiActionType.CREATE_GOAL_CONTRIBUTION_PLAN:
        return 'Bạn không có quyền lập kế hoạch đóng góp mục tiêu cho gia đình. Hãy nhờ Trưởng nhóm hoặc Phó nhóm thực hiện giúp bạn.';
      case AiActionType.ALLOCATE_FUND_BY_MODEL:
        return 'Bạn không có quyền chia quỹ theo mô hình hũ. Hãy nhờ Trưởng nhóm hoặc Phó nhóm thực hiện giúp bạn.';
      case AiActionType.CREATE_TASK:
        return 'Bạn không có quyền tạo công việc cho gia đình. Hãy nhờ Trưởng nhóm hoặc Phó nhóm thực hiện giúp bạn.';
      case AiActionType.CREATE_CALENDAR_EVENT:
        return 'Bạn không có quyền tạo sự kiện lịch gia đình. Hãy nhờ Trưởng nhóm hoặc Phó nhóm thực hiện giúp bạn.';
      default:
        return 'Bạn không có quyền thực hiện hành động này. Hãy nhờ Trưởng nhóm hoặc Phó nhóm thực hiện giúp bạn.';
    }
  }
}
