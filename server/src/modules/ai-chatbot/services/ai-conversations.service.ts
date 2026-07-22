import { Injectable, NotFoundException } from '@nestjs/common';
import type { AIConversation, AIMessage } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import type { AiMessageQueryDto } from '../dto/ai-message-query.dto';
import type {
  AiPendingAction,
  AiPermissionContext,
} from '../types/ai-chatbot.types';
import { AiActionStatus } from '../types/ai-chatbot.types';

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
    return {
      id: message.id,
      senderType: message.senderType,
      content: message.messageContent,
      relatedModule: message.relatedModule,
      createdAt: message.createdAt,
      pendingAction,
    };
  }

  toPendingActionView(messageId: string, action: AiPendingAction) {
    return {
      messageId,
      actionType: action.actionType,
      status: action.status,
      preview: action.payload,
      expiresAt: action.expiresAt,
      result:
        action.status === AiActionStatus.CONFIRMED ? action.result : undefined,
    };
  }
}
