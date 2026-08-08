import { Injectable, NotFoundException } from '@nestjs/common';
import { AiRelatedModule } from '@prisma/client';
import type { AIConversation, AIMessage } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import type { AiMessageQueryDto } from '../dto/ai-message-query.dto';
import type {
  AiActionPreviewField,
  AiMessageUiHints,
  AiPendingAction,
  AiPermissionContext,
  AiQuickAction,
  AiToolTrace,
} from '../types/ai-chatbot.types';
import { AiActionStatus, AiActionType } from '../types/ai-chatbot.types';

const TITLE_MAX_LENGTH = 60;

@Injectable()
export class AiConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(familyId: string, memberId: string, title?: string) {
    return this.prisma.aIConversation.create({
      data: {
        workspaceId: familyId,
        memberId,
        conversationTitle: title?.trim() || null,
      },
    });
  }

  /** Cuộc trò chuyện AI là riêng tư — chỉ trả về của chính member. */
  async listByMember(
    familyId: string,
    memberId: string,
    page: number,
    limit: number,
  ) {
    const where = { workspaceId: familyId, memberId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.aIConversation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { messageContent: true, senderType: true, createdAt: true },
          },
        },
      }),
      this.prisma.aIConversation.count({ where }),
    ]);
    return {
      items: items.map((conversation) => ({
        id: conversation.id,
        conversationTitle: conversation.conversationTitle,
        createdAt: conversation.createdAt,
        lastMessage: conversation.messages[0] ?? null,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** 404 khi không tồn tại HOẶC không phải chủ — không lộ sự tồn tại cho người khác. */
  async getOwnedConversationOrThrow(
    familyId: string,
    memberId: string,
    conversationId: string,
  ): Promise<AIConversation> {
    const conversation = await this.prisma.aIConversation.findFirst({
      where: { id: conversationId, workspaceId: familyId, memberId },
    });
    if (!conversation) {
      throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
    }
    return conversation;
  }

  async listMessages(
    familyId: string,
    memberId: string,
    conversationId: string,
    query: AiMessageQueryDto,
  ) {
    await this.getOwnedConversationOrThrow(familyId, memberId, conversationId);
    const where = { aiConversationId: conversationId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.aIMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.aIMessage.count({ where }),
    ]);
    return {
      // Đảo lại asc để client render theo dòng thời gian trong trang.
      items: items.reverse().map((message) => this.toMessageView(message)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async delete(familyId: string, memberId: string, conversationId: string) {
    await this.getOwnedConversationOrThrow(familyId, memberId, conversationId);
    // FK onDelete: Cascade xóa luôn messages.
    await this.prisma.aIConversation.delete({ where: { id: conversationId } });
    return { id: conversationId };
  }

  /** Đặt tiêu đề theo tin nhắn đầu tiên nếu chưa có. */
  async ensureTitle(conversation: AIConversation, firstMessage: string) {
    if (conversation.conversationTitle) return;
    const trimmed = firstMessage.trim().replace(/\s+/g, ' ');
    const title =
      trimmed.length > TITLE_MAX_LENGTH
        ? `${trimmed.slice(0, TITLE_MAX_LENGTH)}…`
        : trimmed;
    await this.prisma.aIConversation.update({
      where: { id: conversation.id },
      data: { conversationTitle: title },
    });
  }

  /**
   * Map message DB → payload client: giữ pendingAction (để render lại nút xác
   * nhận sau reload), bỏ toolTrace/familyRole cho gọn.
   */
  toMessageView(message: AIMessage) {
    const context = message.permissionContext as AiPermissionContext | null;
    const pendingAction = context?.pendingAction
      ? this.toPendingActionView(message.id, context.pendingAction)
      : null;
    const relatedModule = message.relatedModule ?? AiRelatedModule.GENERAL;
    return {
      id: message.id,
      senderType: message.senderType,
      content: message.messageContent,
      relatedModule: message.relatedModule,
      createdAt: message.createdAt,
      pendingAction,
      uiHints: this.buildMessageUiHints(
        relatedModule,
        message.messageContent,
        pendingAction?.status,
        context?.toolTrace ?? [],
      ),
    };
  }

  toPendingActionView(messageId: string, action: AiPendingAction) {
    return {
      messageId,
      actionType: action.actionType,
      status: action.status,
      preview: action.payload,
      expiresAt: action.expiresAt,
      uiHints: this.buildPendingActionUiHints(action),
      result:
        action.status === AiActionStatus.CONFIRMED ? action.result : undefined,
    };
  }

  private buildMessageUiHints(
    relatedModule: AiRelatedModule,
    content: string,
    pendingStatus?: AiActionStatus,
    toolTrace: AiToolTrace[] = [],
  ): AiMessageUiHints {
    const usedDailyBrief = toolTrace.some(
      (trace) => trace.tool === 'get_daily_brief' && trace.ok,
    );
    const permissionLimited =
      /kh[oô]ng c[oó] quy[eề]n/i.test(content) ||
      /khong co quyen/i.test(content);
    if (permissionLimited) {
      return {
        displayStyle: 'PERMISSION_NOTICE',
        intent: 'PERMISSION_LIMIT',
        title: 'Giới hạn quyền truy cập',
        icon: 'shield',
        confidenceLabel: 'Tham khảo',
        quickActions: this.quickActionsFor(AiRelatedModule.GENERAL),
      };
    }
    if (pendingStatus === AiActionStatus.PENDING) {
      return {
        displayStyle: 'ACTION_CARD',
        intent: 'ACTION_PROPOSAL',
        title: 'Đề xuất cần bạn xác nhận',
        icon: this.iconForModule(relatedModule),
        confidenceLabel: 'Chờ xác nhận',
        quickActions: this.quickActionsFor(relatedModule),
      };
    }
    if (pendingStatus === AiActionStatus.CONFIRMED) {
      return {
        displayStyle: 'RESULT_CARD',
        intent: 'ACTION_RESULT',
        title: 'Đã thực hiện đề xuất',
        icon: this.iconForModule(relatedModule),
        confidenceLabel: 'Có dữ liệu',
        quickActions: this.quickActionsFor(relatedModule),
      };
    }
    if (usedDailyBrief) {
      return {
        displayStyle: 'INSIGHT_CARD',
        intent: 'INSIGHT',
        title: 'Tổng quan hôm nay',
        icon: 'sparkles',
        confidenceLabel: 'Có dữ liệu',
        quickActions: this.quickActionsFor(AiRelatedModule.GENERAL),
      };
    }
    const isInsight = relatedModule !== AiRelatedModule.GENERAL;
    return {
      displayStyle: isInsight ? 'INSIGHT_CARD' : 'TEXT',
      intent: isInsight ? 'INSIGHT' : 'GENERAL',
      title: this.titleForModule(relatedModule),
      icon: this.iconForModule(relatedModule),
      confidenceLabel: isInsight ? 'Có dữ liệu' : 'Tham khảo',
      quickActions: this.quickActionsFor(relatedModule),
    };
  }

  private buildPendingActionUiHints(action: AiPendingAction) {
    const fields = this.previewFieldsFor(action.actionType, action.payload);
    switch (action.actionType) {
      case AiActionType.CREATE_LEDGER_ENTRY:
        return {
          title: 'Tạo giao dịch tài chính',
          description:
            'AI đã chuẩn bị bản nháp giao dịch. Chỉ ghi sổ khi bạn xác nhận.',
          icon: 'wallet' as const,
          primaryActionLabel: 'Xác nhận ghi sổ',
          secondaryActionLabel: 'Hủy đề xuất',
          editActionLabel: 'Chỉnh trước khi ghi',
          fields,
        };
      case AiActionType.CREATE_BUDGET_PLAN:
        return {
          title: 'Tạo kế hoạch ngân sách',
          description:
            'AI đã chuẩn bị bản nháp ngân sách. Kế hoạch chỉ được tạo sau khi bạn xác nhận.',
          icon: 'wallet' as const,
          primaryActionLabel: 'Xác nhận tạo ngân sách',
          secondaryActionLabel: 'Hủy đề xuất',
          editActionLabel: 'Chỉnh ngân sách',
          fields,
        };
      case AiActionType.CREATE_BUDGET_LINE:
        return {
          title: 'Thêm dòng ngân sách',
          description:
            'AI đã chuẩn bị một dòng ngân sách mới. Dòng này chỉ được thêm sau khi bạn xác nhận.',
          icon: 'wallet' as const,
          primaryActionLabel: 'Xác nhận thêm dòng',
          secondaryActionLabel: 'Hủy đề xuất',
          editActionLabel: 'Chỉnh dòng ngân sách',
          fields,
        };
      case AiActionType.CREATE_FINANCIAL_GOAL:
        return {
          title: 'Tạo mục tiêu tài chính',
          description:
            'AI đã chuẩn bị mục tiêu tiết kiệm. Mục tiêu chỉ được tạo sau khi bạn xác nhận.',
          icon: 'wallet' as const,
          primaryActionLabel: 'Xác nhận tạo mục tiêu',
          secondaryActionLabel: 'Hủy đề xuất',
          editActionLabel: 'Chỉnh mục tiêu',
          fields,
        };
      case AiActionType.CREATE_GOAL_ALLOCATION:
        return {
          title: 'Phân bổ vào mục tiêu',
          description:
            'AI đã chuẩn bị khoản phân bổ cho mục tiêu tài chính. Chỉ thực hiện sau khi bạn xác nhận.',
          icon: 'wallet' as const,
          primaryActionLabel: 'Xác nhận phân bổ',
          secondaryActionLabel: 'Hủy đề xuất',
          editActionLabel: 'Chỉnh phân bổ',
          fields,
        };
      case AiActionType.CREATE_GOAL_CONTRIBUTION_PLAN:
        return {
          title: 'Lập kế hoạch đóng góp',
          description:
            'AI đã chuẩn bị kế hoạch đóng góp cho mục tiêu. Chỉ tạo sau khi bạn xác nhận.',
          icon: 'wallet' as const,
          primaryActionLabel: 'Xác nhận lập kế hoạch',
          secondaryActionLabel: 'Hủy đề xuất',
          editActionLabel: 'Chỉnh kế hoạch',
          fields,
        };
      case AiActionType.ALLOCATE_FUND_BY_MODEL:
        return {
          title: 'Chia quỹ theo mô hình hũ',
          description:
            'AI đã chuẩn bị đề xuất chia quỹ. Các giao dịch phân bổ chỉ được tạo sau khi bạn xác nhận.',
          icon: 'wallet' as const,
          primaryActionLabel: 'Xác nhận chia quỹ',
          secondaryActionLabel: 'Hủy đề xuất',
          editActionLabel: 'Chỉnh chia quỹ',
          fields,
        };
      case AiActionType.CREATE_TASK:
        return {
          title: 'Tạo công việc gia đình',
          description:
            'AI đã chuẩn bị công việc mới. Bạn có thể xác nhận hoặc chỉnh lại.',
          icon: 'check-square' as const,
          primaryActionLabel: 'Xác nhận tạo việc',
          secondaryActionLabel: 'Hủy đề xuất',
          editActionLabel: 'Chỉnh công việc',
          fields,
        };
      case AiActionType.CREATE_CALENDAR_EVENT:
        return {
          title: 'Tạo sự kiện lịch',
          description:
            'AI đã chuẩn bị lịch hẹn. Sự kiện chỉ được tạo sau khi bạn xác nhận.',
          icon: 'calendar' as const,
          primaryActionLabel: 'Xác nhận tạo lịch',
          secondaryActionLabel: 'Hủy đề xuất',
          editActionLabel: 'Chỉnh lịch hẹn',
          fields,
        };
      default:
        return {
          title: 'Đề xuất hành động',
          description: 'AI đã chuẩn bị một đề xuất cần bạn xác nhận.',
          icon: 'sparkles' as const,
          primaryActionLabel: 'Xác nhận',
          secondaryActionLabel: 'Hủy',
          editActionLabel: 'Chỉnh sửa',
          fields,
        };
    }
  }

  private previewFieldsFor(
    actionType: AiActionType,
    payload: Record<string, unknown>,
  ): AiActionPreviewField[] {
    if (actionType === AiActionType.CREATE_TASK) {
      const task = this.asRecord(payload.task);
      const assignment = this.asRecord(payload.assignment);
      return [
        this.field('Công việc', task.title),
        this.field('Hạn hoàn thành', task.dueDate),
        this.field('Người nhận', assignment.assignedToMemberId),
      ].filter(Boolean) as AiActionPreviewField[];
    }
    if (actionType === AiActionType.CREATE_CALENDAR_EVENT) {
      return [
        this.field('Tiêu đề', payload.title),
        this.field('Bắt đầu', payload.startTime),
        this.field('Kết thúc', payload.endTime),
        this.field('Địa điểm', payload.location),
      ].filter(Boolean) as AiActionPreviewField[];
    }
    if (actionType === AiActionType.CREATE_BUDGET_PLAN) {
      const lines = Array.isArray(payload.lines) ? payload.lines : [];
      return [
        this.field('Tên ngân sách', payload.planName),
        this.field('Loại kỳ', payload.periodType),
        this.field('Bắt đầu', payload.periodStart),
        this.field('Kết thúc', payload.periodEnd),
        this.field(
          'Thu chung dự kiến',
          this.formatMoney(payload.expectedSharedIncome),
        ),
        this.field(
          'Chi chung dự kiến',
          this.formatMoney(payload.expectedSharedExpense),
        ),
        this.field('Số dòng ngân sách', lines.length || undefined),
      ].filter(Boolean) as AiActionPreviewField[];
    }
    if (actionType === AiActionType.CREATE_BUDGET_LINE) {
      const line = this.asRecord(payload.line);
      return [
        this.field('Budget plan', payload.budgetPlanId),
        this.field('Category', line.categoryId),
        this.field('Hũ', line.jarId),
        this.field('Số tiền kế hoạch', this.formatMoney(line.plannedAmount)),
        this.field('Ngưỡng tiền', this.formatMoney(line.thresholdAmount)),
        this.field('Ngưỡng %', line.thresholdPercent),
        this.field('Ghi chú', line.note),
      ].filter(Boolean) as AiActionPreviewField[];
    }
    if (actionType === AiActionType.CREATE_FINANCIAL_GOAL) {
      return [
        this.field('Tên mục tiêu', payload.goalName),
        this.field('Số tiền mục tiêu', this.formatMoney(payload.targetAmount)),
        this.field('Hạn mục tiêu', payload.deadline),
        this.field(
          'Đóng góp mỗi tháng',
          this.formatMoney(payload.monthlyContributionTarget),
        ),
      ].filter(Boolean) as AiActionPreviewField[];
    }
    if (actionType === AiActionType.CREATE_GOAL_ALLOCATION) {
      const allocation = this.asRecord(payload.allocation);
      return [
        this.field('Mục tiêu', payload.goalId),
        this.field('Giao dịch nguồn', allocation.ledgerEntryId),
        this.field('Số tiền phân bổ', this.formatMoney(allocation.amount)),
      ].filter(Boolean) as AiActionPreviewField[];
    }
    if (actionType === AiActionType.CREATE_GOAL_CONTRIBUTION_PLAN) {
      const contributionPlan = this.asRecord(payload.contributionPlan);
      const members = Array.isArray(contributionPlan.members)
        ? contributionPlan.members
        : [];
      return [
        this.field('Mục tiêu', payload.goalId),
        this.field('Tháng', contributionPlan.periodMonth),
        this.field('Năm', contributionPlan.periodYear),
        this.field('Hạn đóng góp', contributionPlan.dueDate),
        this.field('Số thành viên', members.length),
      ].filter(Boolean) as AiActionPreviewField[];
    }
    if (actionType === AiActionType.ALLOCATE_FUND_BY_MODEL) {
      return [
        this.field('Mô hình', payload.modelId),
        this.field('Tổng tiền chia', this.formatMoney(payload.amount)),
        this.field('Tháng', payload.periodMonth),
        this.field('Năm', payload.periodYear),
        this.field('Ghi chú', payload.note),
      ].filter(Boolean) as AiActionPreviewField[];
    }
    return [
      this.field('Loại', payload.entryType),
      this.field('Số tiền', this.formatMoney(payload.amount)),
      this.field('Nội dung', payload.description),
      this.field('Ngày', payload.entryDate),
    ].filter(Boolean) as AiActionPreviewField[];
  }

  private field(label: string, value: unknown): AiActionPreviewField | null {
    if (value === null || value === undefined || value === '') return null;
    return { label, value: this.formatPreviewValue(value) };
  }

  private formatPreviewValue(value: unknown): string {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return value.toString();
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    try {
      return JSON.stringify(value);
    } catch {
      return 'Không hiển thị được';
    }
  }

  private formatMoney(value: unknown): string | null {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return null;
    return `${amount.toLocaleString('vi-VN')}đ`;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  }

  private titleForModule(module: AiRelatedModule): string {
    switch (module) {
      case AiRelatedModule.FINANCE:
        return 'Phân tích tài chính';
      case AiRelatedModule.TASK:
        return 'Gợi ý công việc';
      case AiRelatedModule.CALENDAR:
        return 'Lịch gia đình';
      case AiRelatedModule.SOS:
        return 'An toàn gia đình';
      default:
        return 'Trợ lý Family Care';
    }
  }

  private iconForModule(module: AiRelatedModule): AiMessageUiHints['icon'] {
    switch (module) {
      case AiRelatedModule.FINANCE:
        return 'wallet';
      case AiRelatedModule.TASK:
        return 'check-square';
      case AiRelatedModule.CALENDAR:
        return 'calendar';
      case AiRelatedModule.SOS:
        return 'shield';
      default:
        return 'bot';
    }
  }

  private quickActionsFor(module: AiRelatedModule): AiQuickAction[] {
    if (module === AiRelatedModule.FINANCE) {
      return [
        {
          label: 'Phân tích chi tiêu',
          prompt: 'Phân tích chi tiêu tháng này và chỉ ra khoản bất thường.',
          relatedModule: AiRelatedModule.FINANCE,
        },
        {
          label: 'Đề xuất tiết kiệm',
          prompt:
            'Đề xuất 3 cách tiết kiệm phù hợp với dữ liệu tài chính hiện tại.',
          relatedModule: AiRelatedModule.FINANCE,
        },
        {
          label: 'Tạo giao dịch',
          prompt: 'Giúp tôi ghi một khoản thu hoặc chi mới.',
          relatedModule: AiRelatedModule.FINANCE,
        },
      ];
    }
    if (module === AiRelatedModule.TASK) {
      return [
        {
          label: 'Việc hôm nay',
          prompt: 'Tóm tắt các công việc cần chú ý hôm nay.',
          relatedModule: AiRelatedModule.TASK,
        },
        {
          label: 'Gợi ý phân công',
          prompt: 'Gợi ý cách phân công việc gia đình hợp lý hơn.',
          relatedModule: AiRelatedModule.TASK,
        },
      ];
    }
    if (module === AiRelatedModule.CALENDAR) {
      return [
        {
          label: 'Tóm tắt lịch',
          prompt: 'Tóm tắt lịch gia đình sắp tới.',
          relatedModule: AiRelatedModule.CALENDAR,
        },
        {
          label: 'Tạo nhắc hẹn',
          prompt: 'Giúp tôi tạo một lịch hẹn mới cho gia đình.',
          relatedModule: AiRelatedModule.CALENDAR,
        },
      ];
    }
    return [
      {
        label: 'Chi tiêu tháng này',
        prompt: 'Tóm tắt chi tiêu tháng này của tôi.',
        relatedModule: AiRelatedModule.FINANCE,
      },
      {
        label: 'Việc cần làm',
        prompt: 'Tóm tắt các công việc gia đình cần chú ý.',
        relatedModule: AiRelatedModule.TASK,
      },
      {
        label: 'Lịch sắp tới',
        prompt: 'Tóm tắt lịch gia đình trong những ngày tới.',
        relatedModule: AiRelatedModule.CALENDAR,
      },
    ];
  }
}
