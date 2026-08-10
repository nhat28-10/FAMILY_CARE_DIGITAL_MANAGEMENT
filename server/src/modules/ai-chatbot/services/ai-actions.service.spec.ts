import {
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { AiSenderType, FamilyRole } from '@prisma/client';
import type { FamilyMember } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { CalendarService } from '../../calendar/calendar.service';
import { FinanceService } from '../../finance/services/finance.service';
import { FinancialGoalService } from '../../finance/services/financial-goal.service';
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
  let financeService: {
    createLedgerEntry: jest.Mock;
    createBudgetPlan: jest.Mock;
    createBudgetLine: jest.Mock;
    allocateFundByModel: jest.Mock;
  };
  let financialGoalService: {
    createFinancialGoal: jest.Mock;
    createGoalAllocation: jest.Mock;
    confirmGoalContributionPlans: jest.Mock;
  };
  let tasksService: { createTask: jest.Mock; createTaskAssignment: jest.Mock };
  let calendarService: { createEvent: jest.Mock };
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
        if (name === 'propose_create_calendar_event') {
          return {
            actionType: AiActionType.CREATE_CALENDAR_EVENT,
            allowedRoles: [FamilyRole.FAMILY_MANAGER, FamilyRole.DEPUTY_MEMBER],
          };
        }
        if (name === 'propose_create_budget_plan') {
          return {
            actionType: AiActionType.CREATE_BUDGET_PLAN,
            allowedRoles: [FamilyRole.FAMILY_MANAGER, FamilyRole.DEPUTY_MEMBER],
          };
        }
        if (name === 'propose_create_budget_line') {
          return {
            actionType: AiActionType.CREATE_BUDGET_LINE,
            allowedRoles: [FamilyRole.FAMILY_MANAGER, FamilyRole.DEPUTY_MEMBER],
          };
        }
        if (name === 'propose_create_financial_goal') {
          return {
            actionType: AiActionType.CREATE_FINANCIAL_GOAL,
            allowedRoles: [FamilyRole.FAMILY_MANAGER, FamilyRole.DEPUTY_MEMBER],
          };
        }
        if (name === 'propose_create_goal_allocation') {
          return {
            actionType: AiActionType.CREATE_GOAL_ALLOCATION,
            allowedRoles: [
              FamilyRole.FAMILY_MANAGER,
              FamilyRole.DEPUTY_MEMBER,
              FamilyRole.FAMILY_MEMBER,
            ],
          };
        }
        if (name === 'propose_create_goal_contribution_plan') {
          return {
            actionType: AiActionType.CREATE_GOAL_CONTRIBUTION_PLAN,
            allowedRoles: [FamilyRole.FAMILY_MANAGER, FamilyRole.DEPUTY_MEMBER],
          };
        }
        if (name === 'propose_allocate_fund_by_model') {
          return {
            actionType: AiActionType.ALLOCATE_FUND_BY_MODEL,
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
      createBudgetPlan: jest.fn().mockResolvedValue({ id: 'budget-plan-1' }),
      createBudgetLine: jest.fn().mockResolvedValue({ id: 'budget-line-1' }),
      allocateFundByModel: jest.fn().mockResolvedValue({
        sourceId: 'model-1:2026-08',
        entries: [{ id: 'allocation-entry-1' }],
      }),
    };
    financialGoalService = {
      createFinancialGoal: jest
        .fn()
        .mockResolvedValue({ goal: { id: 'goal-1' }, progress: {} }),
      createGoalAllocation: jest
        .fn()
        .mockResolvedValue({ allocation: { id: 'goal-allocation-1' } }),
      confirmGoalContributionPlans: jest.fn().mockResolvedValue({
        goalId: 'goal-1',
        periodMonth: 8,
        periodYear: 2026,
      }),
    };
    tasksService = {
      createTask: jest.fn().mockResolvedValue({ id: 'task-1' }),
      createTaskAssignment: jest.fn().mockResolvedValue({ id: 'assign-1' }),
    };
    calendarService = {
      createEvent: jest.fn().mockResolvedValue({ id: 'event-1' }),
    };
    service = new AiActionsService(
      prisma as unknown as PrismaService,
      conversations as unknown as AiConversationsService,
      toolRegistry as unknown as ToolRegistryService,
      financeService as unknown as FinanceService,
      financialGoalService as unknown as FinancialGoalService,
      tasksService as unknown as TasksService,
      calendarService as unknown as CalendarService,
    );
    (
      service as unknown as {
        logger: { error: (...args: unknown[]) => void };
      }
    ).logger = { error: jest.fn() };
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
      actionIndex: 0,
      actionType: AiActionType.CREATE_LEDGER_ENTRY,
      result: { id: 'entry-1' },
    });
  });

  it('confirm CREATE_BUDGET_PLAN gọi FinanceService.createBudgetPlan', async () => {
    const budgetPayload = {
      planName: 'Ngân sách tháng 8/2026',
      periodType: 'MONTHLY',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      expectedSharedIncome: 30000000,
      expectedSharedExpense: 22000000,
      lines: [],
    };
    prisma.aIMessage.findFirst.mockResolvedValue(
      buildMessage({
        permissionContext: {
          familyRole: FamilyRole.FAMILY_MANAGER,
          toolTrace: [],
          pendingAction: {
            actionType: AiActionType.CREATE_BUDGET_PLAN,
            payload: budgetPayload,
            status: AiActionStatus.PENDING,
            proposedByMemberId: member.id,
            expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          },
        },
      }),
    );

    const result = await confirm();

    expect(financeService.createBudgetPlan).toHaveBeenCalledWith(
      familyId,
      member.id,
      budgetPayload,
    );
    expect(prisma.aIMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          messageContent:
            'Đã tạo kế hoạch ngân sách "Ngân sách tháng 8/2026" thành công.',
          relatedModule: 'FINANCE',
        }),
      }),
    );
    expect(result).toEqual({
      actionIndex: 0,
      actionType: AiActionType.CREATE_BUDGET_PLAN,
      result: { id: 'budget-plan-1' },
    });
  });

  it('confirm CREATE_FINANCIAL_GOAL gọi FinancialGoalService.createFinancialGoal', async () => {
    const goalPayload = {
      goalName: 'Quỹ dự phòng',
      targetAmount: 50000000,
      deadline: '2026-12-31',
      monthlyContributionTarget: 5000000,
    };
    prisma.aIMessage.findFirst.mockResolvedValue(
      buildMessage({
        permissionContext: {
          familyRole: FamilyRole.FAMILY_MANAGER,
          toolTrace: [],
          pendingAction: {
            actionType: AiActionType.CREATE_FINANCIAL_GOAL,
            payload: goalPayload,
            status: AiActionStatus.PENDING,
            proposedByMemberId: member.id,
            expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          },
        },
      }),
    );

    const result = await confirm();

    expect(financialGoalService.createFinancialGoal).toHaveBeenCalledWith(
      familyId,
      member.id,
      goalPayload,
    );
    expect(prisma.aIMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          messageContent:
            'Đã tạo mục tiêu tài chính "Quỹ dự phòng" thành công.',
          relatedModule: 'FINANCE',
        }),
      }),
    );
    expect(result).toEqual({
      actionIndex: 0,
      actionType: AiActionType.CREATE_FINANCIAL_GOAL,
      result: { id: 'goal-1' },
    });
  });

  it('confirm CREATE_BUDGET_LINE gọi FinanceService.createBudgetLine', async () => {
    const budgetLinePayload = {
      budgetPlanId: 'budget-plan-1',
      line: {
        categoryId: 'category-1',
        plannedAmount: 5000000,
        thresholdPercent: 80,
      },
    };
    prisma.aIMessage.findFirst.mockResolvedValue(
      buildMessage({
        permissionContext: {
          familyRole: FamilyRole.FAMILY_MANAGER,
          toolTrace: [],
          pendingAction: {
            actionType: AiActionType.CREATE_BUDGET_LINE,
            payload: budgetLinePayload,
            status: AiActionStatus.PENDING,
            proposedByMemberId: member.id,
            expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          },
        },
      }),
    );

    const result = await confirm();

    expect(financeService.createBudgetLine).toHaveBeenCalledWith(
      familyId,
      budgetLinePayload.budgetPlanId,
      budgetLinePayload.line,
    );
    expect(result).toEqual({
      actionIndex: 0,
      actionType: AiActionType.CREATE_BUDGET_LINE,
      result: { id: 'budget-line-1' },
    });
  });

  it('confirm CREATE_GOAL_ALLOCATION gọi FinancialGoalService.createGoalAllocation', async () => {
    const allocationPayload = {
      goalId: 'goal-1',
      allocation: { amount: 2000000 },
    };
    prisma.aIMessage.findFirst.mockResolvedValue(
      buildMessage({
        permissionContext: {
          familyRole: FamilyRole.FAMILY_MANAGER,
          toolTrace: [],
          pendingAction: {
            actionType: AiActionType.CREATE_GOAL_ALLOCATION,
            payload: allocationPayload,
            status: AiActionStatus.PENDING,
            proposedByMemberId: member.id,
            expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          },
        },
      }),
    );

    const result = await confirm();

    expect(financialGoalService.createGoalAllocation).toHaveBeenCalledWith(
      familyId,
      member.id,
      allocationPayload.goalId,
      allocationPayload.allocation,
    );
    expect(result).toEqual({
      actionIndex: 0,
      actionType: AiActionType.CREATE_GOAL_ALLOCATION,
      result: { id: 'goal-allocation-1' },
    });
  });

  it('confirm CREATE_GOAL_CONTRIBUTION_PLAN gọi FinancialGoalService.confirmGoalContributionPlans', async () => {
    const contributionPayload = {
      goalId: 'goal-1',
      contributionPlan: {
        periodMonth: 8,
        periodYear: 2026,
        dueDate: '2026-08-31',
        members: [{ memberId: member.id, plannedAmount: 3000000 }],
      },
    };
    prisma.aIMessage.findFirst.mockResolvedValue(
      buildMessage({
        permissionContext: {
          familyRole: FamilyRole.FAMILY_MANAGER,
          toolTrace: [],
          pendingAction: {
            actionType: AiActionType.CREATE_GOAL_CONTRIBUTION_PLAN,
            payload: contributionPayload,
            status: AiActionStatus.PENDING,
            proposedByMemberId: member.id,
            expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          },
        },
      }),
    );

    const result = await confirm();

    expect(
      financialGoalService.confirmGoalContributionPlans,
    ).toHaveBeenCalledWith(
      familyId,
      member.id,
      contributionPayload.goalId,
      contributionPayload.contributionPlan,
    );
    expect(result).toEqual({
      actionIndex: 0,
      actionType: AiActionType.CREATE_GOAL_CONTRIBUTION_PLAN,
      result: { id: 'goal-1' },
    });
  });

  it('confirm ALLOCATE_FUND_BY_MODEL gọi FinanceService.allocateFundByModel', async () => {
    const allocationPayload = {
      amount: 10000000,
      periodMonth: 8,
      periodYear: 2026,
      note: 'Chia quỹ tháng 8',
    };
    prisma.aIMessage.findFirst.mockResolvedValue(
      buildMessage({
        permissionContext: {
          familyRole: FamilyRole.FAMILY_MANAGER,
          toolTrace: [],
          pendingAction: {
            actionType: AiActionType.ALLOCATE_FUND_BY_MODEL,
            payload: allocationPayload,
            status: AiActionStatus.PENDING,
            proposedByMemberId: member.id,
            expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          },
        },
      }),
    );

    const result = await confirm();

    expect(financeService.allocateFundByModel).toHaveBeenCalledWith(
      familyId,
      member.id,
      allocationPayload,
    );
    expect(result).toEqual({
      actionIndex: 0,
      actionType: AiActionType.ALLOCATE_FUND_BY_MODEL,
      result: { id: 'allocation-entry-1' },
    });
  });

  it('confirm ALLOCATE_FUND_BY_MODEL loi thi tra action ve PENDING va ghi log chan doan', async () => {
    const allocationPayload = {
      amount: 100000,
      periodMonth: 8,
      periodYear: 2026,
      note: 'Chia quy thang 8',
    };
    prisma.aIMessage.findFirst.mockResolvedValue(
      buildMessage({
        permissionContext: {
          familyRole: FamilyRole.FAMILY_MANAGER,
          toolTrace: [],
          pendingAction: {
            actionType: AiActionType.ALLOCATE_FUND_BY_MODEL,
            payload: allocationPayload,
            status: AiActionStatus.PENDING,
            proposedByMemberId: member.id,
            expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          },
        },
      }),
    );
    financeService.allocateFundByModel.mockRejectedValue(
      new Error('database proxy timeout'),
    );
    const logger = { error: jest.fn() };
    (
      service as unknown as {
        logger: { error: (...args: unknown[]) => void };
      }
    ).logger = logger;

    await expect(confirm()).rejects.toThrow('database proxy timeout');

    const lastUpdate = prisma.aIMessage.update.mock.calls.at(-1)[0];
    expect(lastUpdate.data.permissionContext.pendingAction.status).toBe(
      AiActionStatus.PENDING,
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('ALLOCATE_FUND_BY_MODEL'),
      expect.any(String),
    );
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

  it('confirm CREATE_CALENDAR_EVENT gọi CalendarService', async () => {
    const calendarPayload = {
      title: 'Khám sức khỏe',
      startTime: '2026-08-01T02:00:00.000Z',
      endTime: '2026-08-01T03:00:00.000Z',
      location: 'Bệnh viện Gia Định',
    };
    prisma.aIMessage.findFirst.mockResolvedValue(
      buildMessage({
        permissionContext: {
          familyRole: FamilyRole.FAMILY_MANAGER,
          toolTrace: [],
          pendingAction: {
            actionType: AiActionType.CREATE_CALENDAR_EVENT,
            payload: calendarPayload,
            status: AiActionStatus.PENDING,
            proposedByMemberId: member.id,
            expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          },
        },
      }),
    );

    const result = await confirm();

    expect(calendarService.createEvent).toHaveBeenCalledWith(
      familyId,
      member.id,
      calendarPayload,
    );
    expect(prisma.aIMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          relatedModule: 'CALENDAR',
        }),
      }),
    );
    expect(result).toEqual({
      actionIndex: 0,
      actionType: AiActionType.CREATE_CALENDAR_EVENT,
      result: { id: 'event-1' },
    });
  });

  it('confirmAtIndex xử lý đúng action thứ hai trong action plan', async () => {
    const calendarPayload = {
      title: 'Nhắc đóng góp quỹ',
      startTime: '2026-08-15T02:00:00.000Z',
      endTime: '2026-08-15T02:30:00.000Z',
    };
    prisma.aIMessage.findFirst.mockResolvedValue(
      buildMessage({
        permissionContext: {
          familyRole: FamilyRole.FAMILY_MANAGER,
          toolTrace: [],
          pendingActions: [
            {
              actionType: AiActionType.CREATE_LEDGER_ENTRY,
              payload: ledgerPayload,
              status: AiActionStatus.PENDING,
              proposedByMemberId: member.id,
              expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
            },
            {
              actionType: AiActionType.CREATE_CALENDAR_EVENT,
              payload: calendarPayload,
              status: AiActionStatus.PENDING,
              proposedByMemberId: member.id,
              expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
            },
          ],
          pendingAction: {
            actionType: AiActionType.CREATE_LEDGER_ENTRY,
            payload: ledgerPayload,
            status: AiActionStatus.PENDING,
            proposedByMemberId: member.id,
            expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          },
        },
      }),
    );

    const result = await service.confirmAtIndex(
      familyId,
      member,
      conversationId,
      messageId,
      1,
    );

    expect(prisma.aIMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          permissionContext: {
            path: ['pendingActions', '1', 'status'],
            equals: AiActionStatus.PENDING,
          },
        }),
      }),
    );
    expect(calendarService.createEvent).toHaveBeenCalledWith(
      familyId,
      member.id,
      calendarPayload,
    );
    const lastUpdate = prisma.aIMessage.update.mock.calls.at(-1)[0];
    expect(lastUpdate.data.permissionContext.pendingActions[1]).toMatchObject({
      status: AiActionStatus.CONFIRMED,
      result: { id: 'event-1' },
    });
    expect(lastUpdate.data.permissionContext.pendingAction).toMatchObject({
      actionType: AiActionType.CREATE_LEDGER_ENTRY,
      status: AiActionStatus.PENDING,
    });
    expect(result).toEqual({
      actionIndex: 1,
      actionType: AiActionType.CREATE_CALENDAR_EVENT,
      result: { id: 'event-1' },
    });
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

    expect(result).toEqual({
      actionIndex: 0,
      actionType: AiActionType.CREATE_LEDGER_ENTRY,
    });
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
