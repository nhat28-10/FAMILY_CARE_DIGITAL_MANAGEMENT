import {
  ForbiddenException,
  GoneException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AiRelatedModule, AiSenderType, Prisma } from '@prisma/client';
import type { AIMessage, FamilyMember } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import type { CreateLedgerEntryDto } from '../../finance/dto/create-ledger-entry.dto';
import { FinanceService } from '../../finance/services/finance.service';
import type { CreateTaskAssignmentDto } from '../../tasks/dto/create-task-assignment.dto';
import type { CreateTaskDto } from '../../tasks/dto/create-task.dto';
import { TasksService } from '../../tasks/services/tasks.service';
import { ToolRegistryService } from '../tools/tool-registry.service';
import {
  AiActionStatus,
  AiActionType,
  type AiPendingAction,
  type AiPermissionContext,
} from '../types/ai-chatbot.types';
import { AiConversationsService } from './ai-conversations.service';

@Injectable()
export class AiActionsService {
  private readonly logger = new Logger(AiActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: AiConversationsService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly financeService: FinanceService,
    private readonly tasksService: TasksService,
  ) {}

  async confirm(
    familyId: string,
    member: FamilyMember,
    conversationId: string,
    messageId: string,
  ) {
    const { message, context, action } = await this.getPendingActionOrThrow(
      familyId,
      member.id,
      conversationId,
      messageId,
    );

    // Hết hạn → đánh dấu EXPIRED rồi báo client.
    if (new Date(action.expiresAt).getTime() < Date.now()) {
      await this.updateActionStatus(message, context, AiActionStatus.EXPIRED);
      throw new GoneException('Đề xuất đã hết hạn, hãy yêu cầu trợ lý tạo lại');
    }

    // Re-check quyền TẠI THỜI ĐIỂM confirm (vai trò có thể đã bị đổi).
    const tool = this.findToolByActionType(action.actionType);
    if (!tool || !tool.allowedRoles.includes(member.familyRole)) {
      throw new ForbiddenException(
        'Bạn không có quyền thực hiện hành động này',
      );
    }

    // Claim nguyên tử PENDING → CONFIRMED (lọc theo Json path) chống double-submit.
    const claimed = await this.claimPending(
      message,
      context,
      AiActionStatus.CONFIRMED,
    );
    if (!claimed) {
      throw new ConflictException('Đề xuất này đã được xử lý');
    }

    let result: { id: string };
    let summary: string;
    let relatedModule: AiRelatedModule;
    try {
      const executed = await this.executeAction(familyId, member.id, action);
      result = executed.result;
      summary = executed.summary;
      relatedModule = executed.relatedModule;
    } catch (error) {
      // Thực thi lỗi → nhả claim về PENDING để user sửa/bấm lại được.
      await this.updateActionStatus(message, context, AiActionStatus.PENDING);
      throw error;
    }

    await this.updateActionStatus(
      message,
      context,
      AiActionStatus.CONFIRMED,
      result,
    );
    // Ghi thêm 1 message AI để transcript phản ánh hành động đã thực hiện.
    await this.prisma.aIMessage.create({
      data: {
        aiConversationId: conversationId,
        senderType: AiSenderType.AI,
        messageContent: summary,
        relatedModule,
      },
    });

    return { actionType: action.actionType, result };
  }

  async reject(
    familyId: string,
    member: FamilyMember,
    conversationId: string,
    messageId: string,
  ) {
    const { message, context, action } = await this.getPendingActionOrThrow(
      familyId,
      member.id,
      conversationId,
      messageId,
    );
    const claimed = await this.claimPending(
      message,
      context,
      AiActionStatus.REJECTED,
    );
    if (!claimed) {
      throw new ConflictException('Đề xuất này đã được xử lý');
    }
    return { actionType: action.actionType };
  }

  // ---------------------------------------------------------------------------

  private async getPendingActionOrThrow(
    familyId: string,
    memberId: string,
    conversationId: string,
    messageId: string,
  ): Promise<{
    message: AIMessage;
    context: AiPermissionContext;
    action: AiPendingAction;
  }> {
    // Ownership: 404 nếu conversation không phải của member này.
    await this.conversations.getOwnedConversationOrThrow(
      familyId,
      memberId,
      conversationId,
    );
    const message = await this.prisma.aIMessage.findFirst({
      where: {
        id: messageId,
        aiConversationId: conversationId,
        senderType: AiSenderType.AI,
      },
    });
    const context = message?.permissionContext as AiPermissionContext | null;
    if (!message || !context?.pendingAction) {
      throw new NotFoundException('Không tìm thấy đề xuất hành động');
    }
    return { message, context, action: context.pendingAction };
  }

  /**
   * Đổi trạng thái PENDING → target bằng updateMany có điều kiện Json path;
   * trả false nếu message đã bị xử lý bởi request khác (double-submit).
   */
  private async claimPending(
    message: AIMessage,
    context: AiPermissionContext,
    target: AiActionStatus,
  ): Promise<boolean> {
    const updated = await this.prisma.aIMessage.updateMany({
      where: {
        id: message.id,
        permissionContext: {
          path: ['pendingAction', 'status'],
          equals: AiActionStatus.PENDING,
        },
      },
      data: {
        permissionContext: this.buildContext(
          context,
          target,
        ) as unknown as Prisma.InputJsonValue,
      },
    });
    return updated.count === 1;
  }

  private async updateActionStatus(
    message: AIMessage,
    context: AiPermissionContext,
    status: AiActionStatus,
    result?: { id: string },
  ): Promise<void> {
    await this.prisma.aIMessage.update({
      where: { id: message.id },
      data: {
        permissionContext: this.buildContext(
          context,
          status,
          result,
        ) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private buildContext(
    context: AiPermissionContext,
    status: AiActionStatus,
    result?: { id: string },
  ): AiPermissionContext {
    return {
      ...context,
      pendingAction: {
        ...context.pendingAction!,
        status,
        ...(result ? { result } : {}),
      },
    };
  }

  private findToolByActionType(actionType: AiActionType) {
    return [
      this.toolRegistry.getTool('propose_create_ledger_entry'),
      this.toolRegistry.getTool('propose_create_task'),
    ].find((tool) => tool?.actionType === actionType);
  }

  private async executeAction(
    familyId: string,
    memberId: string,
    action: AiPendingAction,
  ): Promise<{
    result: { id: string };
    summary: string;
    relatedModule: AiRelatedModule;
  }> {
    switch (action.actionType) {
      case AiActionType.CREATE_LEDGER_ENTRY: {
        const dto = action.payload as unknown as CreateLedgerEntryDto;
        const entry = await this.financeService.createLedgerEntry(
          familyId,
          memberId,
          dto,
        );
        return {
          result: { id: entry.id },
          summary: `Đã tạo giao dịch "${dto.description}" (${Number(
            dto.amount,
          ).toLocaleString('vi-VN')}đ) thành công.`,
          relatedModule: AiRelatedModule.FINANCE,
        };
      }
      case AiActionType.CREATE_TASK: {
        const payload = action.payload as unknown as {
          task: CreateTaskDto;
          assignment?: CreateTaskAssignmentDto;
        };
        const task = await this.tasksService.createTask(
          familyId,
          memberId,
          payload.task,
        );
        let summary = `Đã tạo công việc "${payload.task.title}" thành công.`;
        if (payload.assignment) {
          // Task đã tạo xong — lỗi giao việc không được revert claim (confirm
          // lại sẽ tạo task trùng), chỉ ghi chú để user giao lại thủ công.
          try {
            await this.tasksService.createTaskAssignment(
              familyId,
              task.id,
              memberId,
              payload.assignment,
            );
            summary = `Đã tạo và giao công việc "${payload.task.title}" thành công.`;
          } catch (error) {
            this.logger.error(
              `Tạo task ${task.id} thành công nhưng giao việc lỗi: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            summary = `Đã tạo công việc "${payload.task.title}" nhưng chưa giao được cho thành viên, bạn hãy giao lại thủ công.`;
          }
        }
        return {
          result: { id: task.id },
          summary,
          relatedModule: AiRelatedModule.TASK,
        };
      }
      default:
        this.logger.error(
          `Loại hành động không hỗ trợ: ${String(action.actionType)}`,
        );
        throw new NotFoundException('Loại hành động không được hỗ trợ');
    }
  }
}
