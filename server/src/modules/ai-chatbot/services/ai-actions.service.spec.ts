import {
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { AiSenderType, FamilyRole } from '@prisma/client';
import type { FamilyMember } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { FinanceService } from '../../finance/services/finance.service';
import { TasksService } from '../../tasks/services/tasks.service';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { AiActionStatus, AiActionType } from '../types/ai-chatbot.types';
import { AiActionsService } from './ai-actions.service';
import { AiConversationsService } from './ai-conversations.service';

const familyId = 'family-1';
const conversationId = 'conv-1';
const messageId = 'msg-1';
const member = {
  id: 'member-1',
  familyRole: FamilyRole.FAMILY_MANAGER,
} as FamilyMember;

const ledgerPayload = {
  entryType: 'EXPENSE',
  amount: 200000,
  description: 'tiền chợ',
  entryDate: '2026-07-22T00:00:00.000Z',
};

const buildMessage = (overrides: Record<string, unknown> = {}) => ({
  id: messageId,
  aiConversationId: conversationId,
  senderType: AiSenderType.AI,
  messageContent: 'Đề xuất tạo giao dịch',
  relatedModule: null,
  createdAt: new Date(),
  permissionContext: {
    familyRole: FamilyRole.FAMILY_MANAGER,
    toolTrace: [],
    pendingAction: {
      actionType: AiActionType.CREATE_LEDGER_ENTRY,
      payload: ledgerPayload,
      status: AiActionStatus.PENDING,
      proposedByMemberId: member.id,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    },
    ...(overrides.permissionContext as object | undefined),
  },
  ...overrides,
});

describe('AiActionsService', () => {
  let prisma: {
    aIMessage: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
  };
  let conversations: { getOwnedConversationOrThrow: jest.Mock };
  let toolRegistry: { getTool: jest.Mock };
  let financeService: { createLedgerEntry: jest.Mock };
  let tasksService: { createTask: jest.Mock; createTaskAssignment: jest.Mock };
  let service: AiActionsService;

  beforeEach(() => {
    prisma = {
      aIMessage: {
        findFirst: jest.fn().mockResolvedValue(buildMessage()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    conversations = {
      getOwnedConversationOrThrow: jest
        .fn()
        .mockResolvedValue({ id: conversationId }),
    };
    toolRegistry = {
      getTool: jest.fn((name: string) => {
        if (name === 'propose_create_ledger_entry') {
          return {
            actionType: AiActionType.CREATE_LEDGER_ENTRY,
            allowedRoles: [FamilyRole.FAMILY_MANAGER, FamilyRole.DEPUTY_MEMBER],
          };
        }
        return {
          actionType: AiActionType.CREATE_TASK,
          allowedRoles: [FamilyRole.FAMILY_MANAGER, FamilyRole.DEPUTY_MEMBER],
        };
      }),
    };
    financeService = {
      createLedgerEntry: jest.fn().mockResolvedValue({ id: 'entry-1' }),
    };
    tasksService = {
      createTask: jest.fn().mockResolvedValue({ id: 'task-1' }),
      createTaskAssignment: jest.fn().mockResolvedValue({ id: 'assign-1' }),
    };
    service = new AiActionsService(
      prisma as unknown as PrismaService,
      conversations as unknown as AiConversationsService,
      toolRegistry as unknown as ToolRegistryService,
      financeService as unknown as FinanceService,
      tasksService as unknown as TasksService,
    );
  });

  const confirm = () =>
    service.confirm(familyId, member, conversationId, messageId);

  it('confirm happy path: claim → thực thi service với payload đã lưu → CONFIRMED + message tổng kết', async () => {
    const result = await confirm();

    expect(prisma.aIMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          permissionContext: {
            path: ['pendingAction', 'status'],
            equals: AiActionStatus.PENDING,
          },
        }),
      }),
    );
    expect(financeService.createLedgerEntry).toHaveBeenCalledWith(
      familyId,
      member.id,
      ledgerPayload,
    );
    // update cuối ghi status CONFIRMED + result id.
    const lastUpdate = prisma.aIMessage.update.mock.calls.at(-1)[0];
    expect(lastUpdate.data.permissionContext.pendingAction).toMatchObject({
      status: AiActionStatus.CONFIRMED,
      result: { id: 'entry-1' },
    });
    expect(prisma.aIMessage.create).toHaveBeenCalled();
    expect(result).toEqual({
      actionType: AiActionType.CREATE_LEDGER_ENTRY,
      result: { id: 'entry-1' },
    });
  });

  it('confirm CREATE_TASK kèm assignment gọi đủ 2 service', async () => {
    prisma.aIMessage.findFirst.mockResolvedValue(
      buildMessage({
        permissionContext: {
          familyRole: FamilyRole.FAMILY_MANAGER,
          toolTrace: [],
          pendingAction: {
            actionType: AiActionType.CREATE_TASK,
            payload: {
              task: { title: 'Rửa chén' },
              assignment: { assignedToMemberId: 'member-2' },
            },
            status: AiActionStatus.PENDING,
            proposedByMemberId: member.id,
            expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          },
        },
      }),
    );

    await confirm();

    expect(tasksService.createTask).toHaveBeenCalledWith(familyId, member.id, {
      title: 'Rửa chén',
    });
    expect(tasksService.createTaskAssignment).toHaveBeenCalledWith(
      familyId,
      'task-1',
      member.id,
      { assignedToMemberId: 'member-2' },
    );
  });

  it('double-confirm: claim trượt (count 0) → 409, không thực thi', async () => {
    prisma.aIMessage.updateMany.mockResolvedValue({ count: 0 });

    await expect(confirm()).rejects.toThrow(ConflictException);
    expect(financeService.createLedgerEntry).not.toHaveBeenCalled();
  });

  it('đề xuất hết hạn → đánh dấu EXPIRED + 410', async () => {
    prisma.aIMessage.findFirst.mockResolvedValue(
      buildMessage({
        permissionContext: {
          familyRole: FamilyRole.FAMILY_MANAGER,
          toolTrace: [],
          pendingAction: {
            actionType: AiActionType.CREATE_LEDGER_ENTRY,
            payload: ledgerPayload,
            status: AiActionStatus.PENDING,
            proposedByMemberId: member.id,
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          },
        },
      }),
    );

    await expect(confirm()).rejects.toThrow(GoneException);
    const update = prisma.aIMessage.update.mock.calls[0][0];
    expect(update.data.permissionContext.pendingAction.status).toBe(
      AiActionStatus.EXPIRED,
    );
    expect(financeService.createLedgerEntry).not.toHaveBeenCalled();
  });

  it('không phải chủ conversation → 404 từ ownership check', async () => {
    conversations.getOwnedConversationOrThrow.mockRejectedValue(
      new NotFoundException('Không tìm thấy cuộc trò chuyện'),
    );
    await expect(confirm()).rejects.toThrow(NotFoundException);
  });

  it('vai trò bị hạ sau khi đề xuất → 403 tại thời điểm confirm', async () => {
    const demoted = {
      ...member,
      familyRole: FamilyRole.FAMILY_MEMBER,
    } as FamilyMember;
    await expect(
      service.confirm(familyId, demoted, conversationId, messageId),
    ).rejects.toThrow(ForbiddenException);
    expect(financeService.createLedgerEntry).not.toHaveBeenCalled();
  });

  it('thực thi lỗi → nhả claim về PENDING và ném lại lỗi', async () => {
    financeService.createLedgerEntry.mockRejectedValue(
      new NotFoundException('Không tìm thấy danh mục'),
    );

    await expect(confirm()).rejects.toThrow(NotFoundException);
    const lastUpdate = prisma.aIMessage.update.mock.calls.at(-1)[0];
    expect(lastUpdate.data.permissionContext.pendingAction.status).toBe(
      AiActionStatus.PENDING,
    );
  });

  it('reject: claim PENDING → REJECTED, không gọi service nào', async () => {
    const result = await service.reject(
      familyId,
      member,
      conversationId,
      messageId,
    );

    expect(result).toEqual({ actionType: AiActionType.CREATE_LEDGER_ENTRY });
    expect(financeService.createLedgerEntry).not.toHaveBeenCalled();
    const claim = prisma.aIMessage.updateMany.mock.calls[0][0];
    expect(claim.data.permissionContext.pendingAction.status).toBe(
      AiActionStatus.REJECTED,
    );
  });

  it('message không có pendingAction → 404', async () => {
    prisma.aIMessage.findFirst.mockResolvedValue(
      buildMessage({
        permissionContext: {
          familyRole: FamilyRole.FAMILY_MANAGER,
          toolTrace: [],
        },
      }),
    );
    await expect(confirm()).rejects.toThrow(NotFoundException);
  });
});
