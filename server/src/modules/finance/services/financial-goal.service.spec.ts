import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  FamilyRole,
  FinanceLedgerStatus,
  FinanceVisibility,
  FinancialGoalStatus,
  GoalContributionPlanStatus,
  LedgerEntryStatus,
  LedgerEntryType,
  MemberStatus,
  NotificationPriority,
  NotificationType,
  Prisma,
} from '@prisma/client';

import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { FinanceService } from './finance.service';

type ContributionPlanView = Awaited<
  ReturnType<FinanceService['listGoalContributionPlans']>
>;

describe('FinanceService financial goals', () => {
  const familyId = 'family-id';
  const memberId = 'member-id';
  const goalId = 'goal-id';
  let tx: Record<string, Record<string, jest.Mock>>;
  let prisma: Record<string, unknown>;
  let notifications: { createForMembers: jest.Mock };
  let service: FinanceService;

  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-16T00:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const goal = {
    id: goalId,
    familyId,
    goalName: 'Emergency fund',
    targetAmount: new Prisma.Decimal(100),
    deadline: null,
    monthlyContributionTarget: null,
    relatedJarId: null,
    status: FinancialGoalStatus.ACTIVE,
    createdByMemberId: memberId,
    createdAt: new Date(),
    updatedAt: new Date(),
    relatedJar: null,
  };

  beforeEach(() => {
    tx = {
      familyMember: { findFirst: jest.fn(), findMany: jest.fn() },
      budgetAlert: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      financialGoal: {
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      financeLedger: { upsert: jest.fn() },
      ledgerEntry: { create: jest.fn(), findFirst: jest.fn() },
      goalAllocation: {
        aggregate: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
      goalContributionPlan: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
    };
    prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
      familyMember: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      financialGoal: { findFirst: jest.fn() },
      goalAllocation: { aggregate: jest.fn() },
    };
    notifications = {
      createForMembers: jest.fn().mockResolvedValue({ count: 0 }),
    };
    service = new FinanceService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  it('hides jar-linked goals from normal members when jars have no visibility metadata', async () => {
    (
      prisma.familyMember as { findFirst: jest.Mock }
    ).findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MEMBER,
      status: MemberStatus.ACTIVE,
    });
    (
      prisma.financialGoal as { findFirst: jest.Mock }
    ).findFirst.mockResolvedValue({
      ...goal,
      relatedJarId: 'jar-id',
      relatedJar: { id: 'jar-id' },
    });

    await expect(
      service.getFinancialGoal(familyId, memberId, goalId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns goal detail as a goal and progress wrapper', async () => {
    (
      prisma.familyMember as { findFirst: jest.Mock }
    ).findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    (
      prisma.financialGoal as { findFirst: jest.Mock }
    ).findFirst.mockResolvedValue(goal);
    (
      prisma.goalAllocation as { aggregate: jest.Mock }
    ).aggregate.mockResolvedValue({
      _sum: { amount: new Prisma.Decimal(25) },
    });

    const result = await service.getFinancialGoal(familyId, memberId, goalId);

    expect(result.goal.id).toBe(goalId);
    expect(result.goal.targetAmount).toBe(goal.targetAmount);
    expect(result.goal.status).toBe(FinancialGoalStatus.ACTIVE);
    expect(result.progress.currentAmount.equals(25)).toBe(true);
    expect(result.progress.targetAmount).toBe(goal.targetAmount);
    expect(result.progress.remainingAmount.equals(75)).toBe(true);
    expect(result.progress.progressPercent.equals(25)).toBe(true);
  });

  it('prevents a normal member from allocating another member ledger entry', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MEMBER,
      status: MemberStatus.ACTIVE,
    });
    tx.financialGoal.findFirst.mockResolvedValue(goal);
    tx.ledgerEntry.findFirst.mockResolvedValue({
      id: 'entry-id',
      createdByMemberId: 'other-member-id',
      status: LedgerEntryStatus.ACTIVE,
      entryType: LedgerEntryType.INCOME,
      amount: new Prisma.Decimal(100),
    });

    await expect(
      service.createGoalAllocation(familyId, memberId, goalId, {
        ledgerEntryId: 'entry-id',
        amount: 10,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents total allocations from exceeding the ledger entry amount', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    tx.financialGoal.findFirst.mockResolvedValue(goal);
    tx.ledgerEntry.findFirst.mockResolvedValue({
      id: 'entry-id',
      createdByMemberId: memberId,
      status: LedgerEntryStatus.ACTIVE,
      entryType: LedgerEntryType.CONTRIBUTION,
      amount: new Prisma.Decimal(100),
    });
    tx.goalAllocation.aggregate.mockResolvedValue({
      _sum: { amount: new Prisma.Decimal(80) },
    });

    await expect(
      service.createGoalAllocation(familyId, memberId, goalId, {
        ledgerEntryId: 'entry-id',
        amount: 21,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks a goal achieved when allocations reach its target', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    tx.financialGoal.findFirst.mockResolvedValue(goal);
    tx.ledgerEntry.findFirst.mockResolvedValue({
      id: 'entry-id',
      createdByMemberId: memberId,
      status: LedgerEntryStatus.ACTIVE,
      entryType: LedgerEntryType.REWARD,
      amount: new Prisma.Decimal(100),
    });
    tx.goalAllocation.aggregate
      .mockResolvedValueOnce({ _sum: { amount: null } })
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(100) } });
    tx.goalAllocation.create.mockResolvedValue({ id: 'allocation-id' });
    tx.financialGoal.findUniqueOrThrow.mockResolvedValue(goal);
    tx.financialGoal.update.mockResolvedValue({
      ...goal,
      status: FinancialGoalStatus.ACHIEVED,
    });

    const result = await service.createGoalAllocation(
      familyId,
      memberId,
      goalId,
      { ledgerEntryId: 'entry-id', amount: 100 },
    );

    expect(result.goal.status).toBe(FinancialGoalStatus.ACHIEVED);
    expect(result.progress.isAchieved).toBe(true);
  });

  it('creates a contribution ledger entry for quick goal allocations without a ledger entry id', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    tx.financialGoal.findFirst.mockResolvedValue(goal);
    tx.financeLedger.upsert.mockResolvedValue({ id: 'ledger-id' });
    tx.ledgerEntry.create.mockResolvedValue({
      id: 'generated-entry-id',
      createdByMemberId: memberId,
      status: LedgerEntryStatus.ACTIVE,
      entryType: LedgerEntryType.CONTRIBUTION,
      amount: new Prisma.Decimal(25),
    });
    tx.goalAllocation.aggregate
      .mockResolvedValueOnce({ _sum: { amount: null } })
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(25) } });
    tx.goalAllocation.create.mockResolvedValue({
      id: 'allocation-id',
      ledgerEntryId: 'generated-entry-id',
    });
    tx.financialGoal.findUniqueOrThrow.mockResolvedValue(goal);

    const result = await service.createGoalAllocation(
      familyId,
      memberId,
      goalId,
      { amount: 25 },
    );

    expect(tx.financeLedger.upsert).toHaveBeenCalledWith({
      where: { familyId },
      create: {
        familyId,
        ledgerName: 'Shared Family Ledger',
        status: FinanceLedgerStatus.ACTIVE,
      },
      update: {},
    });
    expect(tx.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ledgerId: 'ledger-id',
        jarId: null,
        createdByMemberId: memberId,
        entryType: LedgerEntryType.CONTRIBUTION,
        amount: new Prisma.Decimal(25),
        description: 'Goal contribution: Emergency fund',
        sourceType: 'GOAL_QUICK_CONTRIBUTION',
        sourceId: goalId,
        status: LedgerEntryStatus.ACTIVE,
      }),
    });
    expect(tx.goalAllocation.create).toHaveBeenCalledWith({
      data: {
        goalId,
        ledgerEntryId: 'generated-entry-id',
        amount: new Prisma.Decimal(25),
        allocatedByMemberId: memberId,
      },
      include: { ledgerEntry: true },
    });
    expect(result.progress.currentAmount.equals(25)).toBe(true);
  });

  it('suggests monthly goal contributions proportionally after shared contributions and handles null monthly finance values', async () => {
    (
      prisma.familyMember as { findFirst: jest.Mock; findMany: jest.Mock }
    ).findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    (
      prisma.financialGoal as { findFirst: jest.Mock }
    ).findFirst.mockResolvedValue({
      ...goal,
      monthlyContributionTarget: new Prisma.Decimal(5000000),
    });
    (
      prisma.familyMember as { findFirst: jest.Mock; findMany: jest.Mock }
    ).findMany.mockResolvedValue([
      {
        id: 'member-a',
        displayName: 'Member A',
        user: { fullName: 'User A' },
        monthlyFinances: [
          {
            expectedIncome: new Prisma.Decimal(9000000),
            expectedPersonalExpense: new Prisma.Decimal(2000000),
            expectedSharedContribution: new Prisma.Decimal(1000000),
            incomeVisibility: FinanceVisibility.FAMILY,
            expenseVisibility: FinanceVisibility.FAMILY,
          },
        ],
      },
      {
        id: 'member-b',
        displayName: 'Member B',
        user: { fullName: 'User B' },
        monthlyFinances: [
          {
            expectedIncome: new Prisma.Decimal(5000000),
            expectedPersonalExpense: null,
            expectedSharedContribution: null,
            incomeVisibility: FinanceVisibility.FAMILY,
            expenseVisibility: FinanceVisibility.FAMILY,
          },
        ],
      },
      {
        id: 'member-c',
        displayName: 'Member C',
        user: { fullName: 'User C' },
        monthlyFinances: [
          {
            expectedIncome: null,
            expectedPersonalExpense: new Prisma.Decimal(1000000),
            expectedSharedContribution: new Prisma.Decimal(500000),
            incomeVisibility: FinanceVisibility.FAMILY,
            expenseVisibility: FinanceVisibility.FAMILY,
          },
        ],
      },
    ]);

    const result = await service.getGoalContributionSuggestions(
      familyId,
      memberId,
      goalId,
      { month: 6, year: 2026 },
    );

    expect(result.totalAvailableAmount).toBe(11000000);
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0]).toMatchObject({
      memberId: 'member-a',
      availableAmount: 6000000,
      suggestedContribution: 2727273,
    });
    expect(result.suggestions[1]).toMatchObject({
      memberId: 'member-b',
      availableAmount: 5000000,
      suggestedContribution: 2272727,
    });
  });

  it('confirms contribution plans by upserting active family members', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    tx.financialGoal.findFirst.mockResolvedValue(goal);
    tx.familyMember.findMany.mockResolvedValue([
      { id: 'member-a' },
      { id: 'member-b' },
    ]);
    tx.goalAllocation.findMany.mockResolvedValue([]);
    tx.goalContributionPlan.upsert.mockResolvedValue({});
    tx.goalContributionPlan.findMany.mockResolvedValue([
      {
        id: 'plan-a',
        familyId,
        goalId,
        memberId: 'member-a',
        periodMonth: 6,
        periodYear: 2026,
        plannedAmount: new Prisma.Decimal(2000000),
        dueDate: new Date('2099-06-30T00:00:00.000Z'),
        status: GoalContributionPlanStatus.PLANNED,
        member: {
          id: 'member-a',
          displayName: 'Member A',
          user: { fullName: 'User A' },
        },
      },
      {
        id: 'plan-b',
        familyId,
        goalId,
        memberId: 'member-b',
        periodMonth: 6,
        periodYear: 2026,
        plannedAmount: new Prisma.Decimal(1000000),
        dueDate: new Date('2099-06-30T00:00:00.000Z'),
        status: GoalContributionPlanStatus.PLANNED,
        member: {
          id: 'member-b',
          displayName: 'Member B',
          user: { fullName: 'User B' },
        },
      },
    ]);
    tx.budgetAlert.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.confirmGoalContributionPlans(
      familyId,
      memberId,
      goalId,
      {
        periodMonth: 6,
        periodYear: 2026,
        dueDate: '2099-06-30',
        members: [
          { memberId: 'member-a', plannedAmount: 2000000 },
          { memberId: 'member-b', plannedAmount: 1000000 },
        ],
      },
    );

    expect(tx.goalContributionPlan.upsert).toHaveBeenCalledTimes(2);
    expect(tx.goalContributionPlan.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          goalId_memberId_periodMonth_periodYear: {
            goalId,
            memberId: 'member-a',
            periodMonth: 6,
            periodYear: 2026,
          },
        },
      }),
    );
    expect(result.totalPlannedAmount).toBe(3000000);
  });

  it('prevents a normal member from confirming contribution plans', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MEMBER,
      status: MemberStatus.ACTIVE,
    });

    await expect(
      service.confirmGoalContributionPlans(familyId, memberId, goalId, {
        periodMonth: 6,
        periodYear: 2026,
        dueDate: '2099-06-30',
        members: [{ memberId, plannedAmount: 100 }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('computes planned vs actual shortage from contribution ledger allocations by contributor', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    tx.financialGoal.findFirst.mockResolvedValue(goal);
    tx.goalContributionPlan.findMany.mockResolvedValue([
      {
        id: 'plan-a',
        familyId,
        goalId,
        memberId: 'member-a',
        periodMonth: 6,
        periodYear: 2026,
        plannedAmount: new Prisma.Decimal(2000000),
        dueDate: new Date('2099-06-30T00:00:00.000Z'),
        status: GoalContributionPlanStatus.PLANNED,
        member: {
          id: 'member-a',
          displayName: 'Member A',
          user: { fullName: 'User A' },
        },
      },
    ]);
    tx.goalAllocation.findMany.mockResolvedValue([
      {
        amount: new Prisma.Decimal(1200000),
        ledgerEntry: { createdByMemberId: 'member-a' },
      },
    ]);
    tx.goalContributionPlan.update.mockResolvedValue({});
    tx.budgetAlert.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.listGoalContributionPlans(
      familyId,
      memberId,
      goalId,
      { month: 6, year: 2026 },
    );

    expect(result.members[0]).toMatchObject({
      memberId: 'member-a',
      plannedAmount: 2000000,
      actualAmount: 1200000,
      shortageAmount: 800000,
      status: GoalContributionPlanStatus.PARTIAL,
    });
    const actualQuery = (
      tx.goalAllocation.findMany as jest.Mock<
        unknown,
        [Prisma.GoalAllocationFindManyArgs]
      >
    ).mock.calls[0][0];
    expect(actualQuery.where!.ledgerEntry).toMatchObject({
      entryType: LedgerEntryType.CONTRIBUTION,
      status: LedgerEntryStatus.ACTIVE,
      createdByMemberId: { in: ['member-a'] },
    });
    expect(tx.goalContributionPlan.update).toHaveBeenCalledWith({
      where: { id: 'plan-a' },
      data: { status: GoalContributionPlanStatus.PARTIAL },
    });
  });

  it('lets a member submit their own contribution plan without creating ledger entries', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MEMBER,
      status: MemberStatus.ACTIVE,
    });
    tx.financialGoal.findFirst.mockResolvedValue(goal);
    tx.goalContributionPlan.findFirst.mockResolvedValue({
      id: 'plan-id',
      familyId,
      goalId,
      memberId,
      periodMonth: 6,
      periodYear: 2026,
      plannedAmount: new Prisma.Decimal(2000000),
      pendingAmount: null,
      dueDate: new Date('2099-06-30T00:00:00.000Z'),
      status: GoalContributionPlanStatus.PLANNED,
      submittedAt: null,
      submittedNote: null,
      reviewedByMemberId: null,
      reviewedAt: null,
      reviewNote: null,
    });
    tx.goalContributionPlan.update.mockResolvedValue({});
    tx.goalContributionPlan.findMany.mockResolvedValue([
      {
        id: 'plan-id',
        familyId,
        goalId,
        memberId,
        periodMonth: 6,
        periodYear: 2026,
        plannedAmount: new Prisma.Decimal(2000000),
        pendingAmount: new Prisma.Decimal(1500000),
        dueDate: new Date('2099-06-30T00:00:00.000Z'),
        status: GoalContributionPlanStatus.PENDING_CONFIRMATION,
        submittedAt: new Date('2026-06-15T00:00:00.000Z'),
        submittedNote: 'Da chuyen khoan',
        reviewedAt: null,
        reviewNote: null,
        member: {
          id: memberId,
          displayName: 'Member A',
          user: { fullName: 'User A' },
        },
      },
    ]);
    tx.goalAllocation.findMany.mockResolvedValue([]);
    tx.budgetAlert.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.submitGoalContributionPlan(
      familyId,
      memberId,
      goalId,
      'plan-id',
      { amount: 1500000, note: 'Da chuyen khoan' },
    );

    expect(tx.goalContributionPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'plan-id' },
        data: expect.objectContaining({
          pendingAmount: new Prisma.Decimal(1500000),
          submittedNote: 'Da chuyen khoan',
          status: GoalContributionPlanStatus.PENDING_CONFIRMATION,
        }),
      }),
    );
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(result.members[0]).toMatchObject({
      pendingAmount: 1500000,
      actualAmount: 0,
      status: GoalContributionPlanStatus.PENDING_CONFIRMATION,
    });
  });

  it('prevents a member from submitting another member contribution plan', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MEMBER,
      status: MemberStatus.ACTIVE,
    });
    tx.financialGoal.findFirst.mockResolvedValue(goal);
    tx.goalContributionPlan.findFirst.mockResolvedValue({
      id: 'plan-id',
      familyId,
      goalId,
      memberId: 'other-member-id',
      periodMonth: 6,
      periodYear: 2026,
      plannedAmount: new Prisma.Decimal(2000000),
      pendingAmount: null,
      dueDate: new Date('2099-06-30T00:00:00.000Z'),
      status: GoalContributionPlanStatus.PLANNED,
    });

    await expect(
      service.submitGoalContributionPlan(
        familyId,
        memberId,
        goalId,
        'plan-id',
        { amount: 1500000 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('approves a pending contribution by creating ledger entry and goal allocation and notifies managers about shortage', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    tx.financialGoal.findFirst.mockResolvedValue(goal);
    tx.goalContributionPlan.findFirst.mockResolvedValue({
      id: 'plan-id',
      familyId,
      goalId,
      memberId: 'contributor-id',
      periodMonth: 6,
      periodYear: 2026,
      plannedAmount: new Prisma.Decimal(2000000),
      pendingAmount: new Prisma.Decimal(1500000),
      dueDate: new Date('2026-06-30T00:00:00.000Z'),
      status: GoalContributionPlanStatus.PENDING_CONFIRMATION,
      submittedAt: new Date('2026-06-15T00:00:00.000Z'),
      submittedNote: 'Da chuyen khoan',
    });
    tx.financeLedger.upsert.mockResolvedValue({ id: 'ledger-id' });
    tx.ledgerEntry.create.mockResolvedValue({ id: 'entry-id' });
    tx.goalAllocation.create.mockResolvedValue({ id: 'allocation-id' });
    tx.goalAllocation.findMany.mockResolvedValue([
      {
        amount: new Prisma.Decimal(1500000),
        ledgerEntry: { createdByMemberId: 'contributor-id' },
      },
    ]);
    tx.goalContributionPlan.update.mockResolvedValue({});
    tx.goalContributionPlan.findMany.mockResolvedValue([
      {
        id: 'plan-id',
        familyId,
        goalId,
        memberId: 'contributor-id',
        periodMonth: 6,
        periodYear: 2026,
        plannedAmount: new Prisma.Decimal(2000000),
        pendingAmount: null,
        dueDate: new Date('2026-06-30T00:00:00.000Z'),
        status: GoalContributionPlanStatus.PARTIAL,
        submittedAt: new Date('2026-06-15T00:00:00.000Z'),
        submittedNote: 'Da chuyen khoan',
        reviewedAt: new Date('2026-06-16T00:00:00.000Z'),
        reviewNote: 'ok',
        member: {
          id: 'contributor-id',
          displayName: 'Member A',
          user: { fullName: 'User A' },
        },
      },
    ]);
    tx.budgetAlert.updateMany.mockResolvedValue({ count: 0 });
    (prisma.familyMember as { findMany: jest.Mock }).findMany.mockResolvedValue(
      [{ id: memberId }, { id: 'deputy-id' }],
    );

    const result = await service.approveGoalContributionPlan(
      familyId,
      memberId,
      goalId,
      'plan-id',
      { note: 'ok' },
    );

    expect(tx.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ledgerId: 'ledger-id',
          createdByMemberId: 'contributor-id',
          entryType: LedgerEntryType.CONTRIBUTION,
          amount: new Prisma.Decimal(1500000),
          sourceType: 'MANUAL',
          sourceId: 'plan-id',
          status: LedgerEntryStatus.ACTIVE,
        }),
      }),
    );
    expect(tx.goalAllocation.create).toHaveBeenCalledWith({
      data: {
        goalId,
        ledgerEntryId: 'entry-id',
        amount: new Prisma.Decimal(1500000),
        allocatedByMemberId: memberId,
      },
    });
    expect(tx.goalContributionPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'plan-id' },
        data: expect.objectContaining({
          pendingAmount: null,
          reviewedByMemberId: memberId,
          reviewNote: 'ok',
          status: GoalContributionPlanStatus.PARTIAL,
        }),
      }),
    );
    expect(result.members[0].actualAmount).toBe(1500000);
    expect(notifications.createForMembers).toHaveBeenCalledWith(
      familyId,
      [memberId, 'deputy-id'],
      expect.objectContaining({
        type: NotificationType.GENERAL,
        priority: NotificationPriority.HIGH,
        referenceType: 'FINANCIAL_GOAL',
        referenceId: goalId,
        body: expect.stringContaining('500000'),
      }),
    );
  });

  it('does not notify managers when an approved contribution fully pays the plan', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    tx.financialGoal.findFirst.mockResolvedValue(goal);
    tx.goalContributionPlan.findFirst.mockResolvedValue({
      id: 'plan-id',
      familyId,
      goalId,
      memberId: 'contributor-id',
      periodMonth: 6,
      periodYear: 2026,
      plannedAmount: new Prisma.Decimal(1500000),
      pendingAmount: new Prisma.Decimal(1500000),
      dueDate: new Date('2026-06-30T00:00:00.000Z'),
      status: GoalContributionPlanStatus.PENDING_CONFIRMATION,
      submittedAt: new Date('2026-06-15T00:00:00.000Z'),
      submittedNote: 'Da chuyen khoan',
    });
    tx.financeLedger.upsert.mockResolvedValue({ id: 'ledger-id' });
    tx.ledgerEntry.create.mockResolvedValue({ id: 'entry-id' });
    tx.goalAllocation.create.mockResolvedValue({ id: 'allocation-id' });
    tx.goalAllocation.findMany.mockResolvedValue([
      {
        amount: new Prisma.Decimal(1500000),
        ledgerEntry: { createdByMemberId: 'contributor-id' },
      },
    ]);
    tx.goalContributionPlan.update.mockResolvedValue({});
    tx.goalContributionPlan.findMany.mockResolvedValue([
      {
        id: 'plan-id',
        familyId,
        goalId,
        memberId: 'contributor-id',
        periodMonth: 6,
        periodYear: 2026,
        plannedAmount: new Prisma.Decimal(1500000),
        pendingAmount: null,
        dueDate: new Date('2026-06-30T00:00:00.000Z'),
        status: GoalContributionPlanStatus.PAID,
        submittedAt: new Date('2026-06-15T00:00:00.000Z'),
        submittedNote: 'Da chuyen khoan',
        reviewedAt: new Date('2026-06-16T00:00:00.000Z'),
        reviewNote: 'ok',
        member: {
          id: 'contributor-id',
          displayName: 'Member A',
          user: { fullName: 'User A' },
        },
      },
    ]);
    tx.budgetAlert.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.approveGoalContributionPlan(
      familyId,
      memberId,
      goalId,
      'plan-id',
      { note: 'ok' },
    );

    expect(result.members[0]).toMatchObject({
      actualAmount: 1500000,
      shortageAmount: 0,
      status: GoalContributionPlanStatus.PAID,
    });
    expect(notifications.createForMembers).not.toHaveBeenCalled();
  });

  it('prevents a normal member from approving contribution plans', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MEMBER,
      status: MemberStatus.ACTIVE,
    });

    await expect(
      service.approveGoalContributionPlan(
        familyId,
        memberId,
        goalId,
        'plan-id',
        { note: 'ok' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(notifications.createForMembers).not.toHaveBeenCalled();
  });

  it('rejects a pending contribution without creating ledger entries', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.DEPUTY_MEMBER,
      status: MemberStatus.ACTIVE,
    });
    tx.financialGoal.findFirst.mockResolvedValue(goal);
    tx.goalContributionPlan.findFirst.mockResolvedValue({
      id: 'plan-id',
      familyId,
      goalId,
      memberId: 'contributor-id',
      periodMonth: 6,
      periodYear: 2026,
      plannedAmount: new Prisma.Decimal(2000000),
      pendingAmount: new Prisma.Decimal(1500000),
      dueDate: new Date('2099-06-30T00:00:00.000Z'),
      status: GoalContributionPlanStatus.PENDING_CONFIRMATION,
    });
    tx.goalContributionPlan.update.mockResolvedValue({});
    tx.goalContributionPlan.findMany.mockResolvedValue([
      {
        id: 'plan-id',
        familyId,
        goalId,
        memberId: 'contributor-id',
        periodMonth: 6,
        periodYear: 2026,
        plannedAmount: new Prisma.Decimal(2000000),
        pendingAmount: new Prisma.Decimal(1500000),
        dueDate: new Date('2099-06-30T00:00:00.000Z'),
        status: GoalContributionPlanStatus.REJECTED,
        submittedAt: new Date('2026-06-15T00:00:00.000Z'),
        submittedNote: 'Da chuyen khoan',
        reviewedAt: new Date('2026-06-16T00:00:00.000Z'),
        reviewNote: 'Sai giao dich',
        member: {
          id: 'contributor-id',
          displayName: 'Member A',
          user: { fullName: 'User A' },
        },
      },
    ]);
    tx.goalAllocation.findMany.mockResolvedValue([]);
    tx.budgetAlert.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.rejectGoalContributionPlan(
      familyId,
      memberId,
      goalId,
      'plan-id',
      { note: 'Sai giao dich' },
    );

    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(tx.goalAllocation.create).not.toHaveBeenCalled();
    expect(tx.goalContributionPlan.update).toHaveBeenCalledWith({
      where: { id: 'plan-id' },
      data: expect.objectContaining({
        reviewedByMemberId: memberId,
        reviewNote: 'Sai giao dich',
        status: GoalContributionPlanStatus.REJECTED,
      }),
    });
    expect(result.members[0]).toMatchObject({
      pendingAmount: 1500000,
      actualAmount: 0,
      status: GoalContributionPlanStatus.REJECTED,
    });
  });

  it('does not include pendingAmount in actualAmount before approval', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    tx.financialGoal.findFirst.mockResolvedValue(goal);
    tx.goalContributionPlan.findMany.mockResolvedValue([
      {
        id: 'plan-id',
        familyId,
        goalId,
        memberId,
        periodMonth: 6,
        periodYear: 2026,
        plannedAmount: new Prisma.Decimal(2000000),
        pendingAmount: new Prisma.Decimal(1500000),
        dueDate: new Date('2099-06-30T00:00:00.000Z'),
        status: GoalContributionPlanStatus.PENDING_CONFIRMATION,
        submittedAt: new Date('2026-06-15T00:00:00.000Z'),
        submittedNote: 'Da chuyen khoan',
        reviewedAt: null,
        reviewNote: null,
        member: {
          id: memberId,
          displayName: 'Member A',
          user: { fullName: 'User A' },
        },
      },
    ]);
    tx.goalAllocation.findMany.mockResolvedValue([]);
    tx.budgetAlert.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.listGoalContributionPlans(
      familyId,
      memberId,
      goalId,
      {
        month: 6,
        year: 2026,
      },
    );

    expect(result.members[0]).toMatchObject({
      pendingAmount: 1500000,
      actualAmount: 0,
      shortageAmount: 2000000,
      status: GoalContributionPlanStatus.PENDING_CONFIRMATION,
    });
  });
});
