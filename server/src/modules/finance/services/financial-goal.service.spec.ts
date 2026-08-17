import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
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
import { FinancialGoalService } from './financial-goal.service';

describe('FinancialGoalService financial goals', () => {
  const familyId = 'family-id';
  const memberId = 'member-id';
  const goalId = 'goal-id';
  let tx: Record<string, Record<string, jest.Mock>>;
  let prisma: Record<string, unknown>;
  let notifications: { notify: jest.Mock; dispatch: jest.Mock };
  let financialGoalService: FinancialGoalService;

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
      financeLedger: { findUnique: jest.fn(), upsert: jest.fn() },
      ledgerEntry: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      goalAllocation: {
        aggregate: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
      goalContributionPlan: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      financeLedger: { findUnique: jest.fn() },
      ledgerEntry: { findMany: jest.fn() },
      financialGoal: { findFirst: jest.fn() },
      goalAllocation: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amount: new Prisma.Decimal(0) } }),
      },
    };
    notifications = {
      notify: jest.fn().mockResolvedValue({ ids: [] }),
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    financialGoalService = new FinancialGoalService(
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
      financialGoalService.getFinancialGoal(familyId, memberId, goalId),
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

    const result = await financialGoalService.getFinancialGoal(
      familyId,
      memberId,
      goalId,
    );

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
      financialGoalService.createGoalAllocation(familyId, memberId, goalId, {
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
      financialGoalService.createGoalAllocation(familyId, memberId, goalId, {
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
    tx.familyMember.findMany.mockResolvedValue([
      { id: memberId },
      { id: 'other-member-id' },
    ]);
    tx.financialGoal.findFirst.mockResolvedValue(goal);
    tx.ledgerEntry.findFirst.mockResolvedValue({
      id: 'entry-id',
      createdByMemberId: memberId,
      status: LedgerEntryStatus.ACTIVE,
      entryType: LedgerEntryType.REWARD,
      amount: new Prisma.Decimal(100),
    });
    tx.goalAllocation.aggregate
      .mockResolvedValueOnce({ _sum: { amount: null } }) // ledger-entry availability check
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(0) } }) // allocatedBefore
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(100) } }); // allocatedAfter (refreshGoalStatus)
    tx.goalAllocation.create.mockResolvedValue({
      id: 'allocation-id',
      amount: new Prisma.Decimal(100),
    });
    tx.financialGoal.findUniqueOrThrow.mockResolvedValue(goal);
    tx.financialGoal.update.mockResolvedValue({
      ...goal,
      status: FinancialGoalStatus.ACHIEVED,
    });

    const result = await financialGoalService.createGoalAllocation(
      familyId,
      memberId,
      goalId,
      { ledgerEntryId: 'entry-id', amount: 100 },
    );

    expect(result.goal.status).toBe(FinancialGoalStatus.ACHIEVED);
    expect(result.progress.isAchieved).toBe(true);
    expect(notifications.notify).toHaveBeenCalledWith(
      familyId,
      expect.arrayContaining([memberId, 'other-member-id']),
      expect.objectContaining({ type: NotificationType.FINANCE }),
      { tx },
    );
    expect(notifications.dispatch).toHaveBeenCalled();
  });

  it('does not notify a goal milestone when the target has not been reached', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    const largeGoal = {
      ...goal,
      targetAmount: new Prisma.Decimal(10000000),
    };
    tx.financialGoal.findFirst.mockResolvedValue(largeGoal);
    tx.ledgerEntry.findFirst.mockResolvedValue({
      id: 'entry-id',
      createdByMemberId: memberId,
      status: LedgerEntryStatus.ACTIVE,
      entryType: LedgerEntryType.REWARD,
      amount: new Prisma.Decimal(100),
    });
    tx.goalAllocation.aggregate
      .mockResolvedValueOnce({ _sum: { amount: null } }) // ledger-entry availability check
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(0) } }) // allocatedBefore
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(40) } }); // allocatedAfter (refreshGoalStatus)
    tx.goalAllocation.create.mockResolvedValue({
      id: 'allocation-id',
      amount: new Prisma.Decimal(40),
    });
    tx.financialGoal.findUniqueOrThrow.mockResolvedValue(largeGoal);
    tx.financialGoal.update.mockResolvedValue(goal);

    const result = await financialGoalService.createGoalAllocation(
      familyId,
      memberId,
      goalId,
      { ledgerEntryId: 'entry-id', amount: 40 },
    );

    expect(result.progress.isAchieved).toBe(false);
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(notifications.dispatch).toHaveBeenCalledWith([]);
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
      .mockResolvedValueOnce({ _sum: { amount: null } }) // ledger-entry availability check
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(0) } }) // allocatedBefore
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(25) } }); // allocatedAfter (refreshGoalStatus)
    tx.goalAllocation.create.mockResolvedValue({
      id: 'allocation-id',
      ledgerEntryId: 'generated-entry-id',
      amount: new Prisma.Decimal(25),
    });
    tx.financialGoal.findUniqueOrThrow.mockResolvedValue(goal);

    const result = await financialGoalService.createGoalAllocation(
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

  it('allocates available monthly surplus to a goal without creating new cash-in', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    const largeGoal = {
      ...goal,
      targetAmount: new Prisma.Decimal(10000000),
    };
    tx.financialGoal.findFirst.mockResolvedValue(largeGoal);
    tx.financeLedger.findUnique.mockResolvedValue({ id: 'ledger-id' });
    tx.ledgerEntry.findMany.mockResolvedValue([
      {
        entryType: LedgerEntryType.CONTRIBUTION,
        amount: new Prisma.Decimal(5000000),
        sourceType: null,
      },
      {
        entryType: LedgerEntryType.EXPENSE,
        amount: new Prisma.Decimal(3000000),
        sourceType: null,
      },
    ]);
    tx.goalAllocation.aggregate
      .mockResolvedValueOnce({ _sum: { amount: null } }) // surplus already allocated
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(0) } }) // allocatedBefore
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(1500000) } }); // allocatedAfter
    tx.financeLedger.upsert.mockResolvedValue({ id: 'ledger-id' });
    tx.ledgerEntry.create.mockResolvedValue({
      id: 'surplus-entry-id',
      amount: new Prisma.Decimal(1500000),
      entryType: LedgerEntryType.ADJUSTMENT,
      status: LedgerEntryStatus.ACTIVE,
    });
    tx.goalAllocation.create.mockResolvedValue({
      id: 'allocation-id',
      ledgerEntryId: 'surplus-entry-id',
      amount: new Prisma.Decimal(1500000),
      ledgerEntry: { id: 'surplus-entry-id' },
    });
    tx.financialGoal.findUniqueOrThrow.mockResolvedValue(largeGoal);

    const result = await financialGoalService.allocateMonthlySurplusToGoal(
      familyId,
      memberId,
      goalId,
      {
        periodMonth: 6,
        periodYear: 2026,
        amount: 1500000,
        note: 'Chuyen so du',
      },
    );

    expect(tx.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ledgerId: 'ledger-id',
        createdByMemberId: memberId,
        entryType: LedgerEntryType.ADJUSTMENT,
        amount: new Prisma.Decimal(1500000),
        sourceType: 'MONTHLY_SURPLUS_TO_GOAL',
        sourceId: 'goal-id:2026-06',
        status: LedgerEntryStatus.ACTIVE,
      }),
    });
    expect(tx.goalAllocation.create).toHaveBeenCalledWith({
      data: {
        goalId,
        ledgerEntryId: 'surplus-entry-id',
        amount: new Prisma.Decimal(1500000),
        allocatedByMemberId: memberId,
      },
      include: { ledgerEntry: true },
    });
    expect(result.surplus).toMatchObject({
      periodMonth: 6,
      periodYear: 2026,
      totalSurplus: 2000000,
      allocatedSurplus: 1500000,
      availableSurplus: 500000,
    });
  });

  it('returns monthly surplus availability for finance managers', async () => {
    (
      prisma.familyMember as { findFirst: jest.Mock }
    ).findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    (
      prisma.financeLedger as { findUnique: jest.Mock }
    ).findUnique.mockResolvedValue({ id: 'ledger-id' });
    (prisma.ledgerEntry as { findMany: jest.Mock }).findMany.mockResolvedValue([
      {
        entryType: LedgerEntryType.CONTRIBUTION,
        amount: new Prisma.Decimal(5000000),
        sourceType: null,
      },
      {
        entryType: LedgerEntryType.EXPENSE,
        amount: new Prisma.Decimal(3000000),
        sourceType: null,
      },
      {
        entryType: LedgerEntryType.ADJUSTMENT,
        amount: new Prisma.Decimal(500000),
        sourceType: 'MONTHLY_SURPLUS_TO_GOAL',
      },
      {
        entryType: LedgerEntryType.ADJUSTMENT,
        amount: new Prisma.Decimal(10000000),
        sourceType: 'MODEL_FUND_ALLOCATION',
      },
    ]);
    (
      prisma.goalAllocation as { aggregate: jest.Mock }
    ).aggregate.mockResolvedValue({
      _sum: { amount: new Prisma.Decimal(500000) },
    });

    const result = await financialGoalService.getMonthlySurplusAvailability(
      familyId,
      memberId,
      { month: 6, year: 2026 },
    );

    expect(result).toEqual({
      periodMonth: 6,
      periodYear: 2026,
      totalSurplus: 2000000,
      allocatedSurplus: 500000,
      availableSurplus: 1500000,
    });
  });

  it('prevents surplus allocation above the remaining monthly surplus', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    tx.financialGoal.findFirst.mockResolvedValue(goal);
    tx.financeLedger.findUnique.mockResolvedValue({ id: 'ledger-id' });
    tx.ledgerEntry.findMany.mockResolvedValue([
      {
        entryType: LedgerEntryType.CONTRIBUTION,
        amount: new Prisma.Decimal(5000000),
        sourceType: null,
      },
      {
        entryType: LedgerEntryType.EXPENSE,
        amount: new Prisma.Decimal(3000000),
        sourceType: null,
      },
    ]);
    tx.goalAllocation.aggregate.mockResolvedValue({
      _sum: { amount: new Prisma.Decimal(1000000) },
    });

    await expect(
      financialGoalService.allocateMonthlySurplusToGoal(
        familyId,
        memberId,
        goalId,
        {
          periodMonth: 6,
          periodYear: 2026,
          amount: 1500000,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(tx.goalAllocation.create).not.toHaveBeenCalled();
  });

  it('prevents normal members from allocating family monthly surplus', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MEMBER,
      status: MemberStatus.ACTIVE,
    });

    await expect(
      financialGoalService.allocateMonthlySurplusToGoal(
        familyId,
        memberId,
        goalId,
        {
          periodMonth: 6,
          periodYear: 2026,
          amount: 100000,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
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

    const result = await financialGoalService.getGoalContributionSuggestions(
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
    expect(result.skippedMembers).toEqual([
      {
        memberId: 'member-c',
        displayName: 'Member C',
        reason: 'NO_AVAILABLE_AMOUNT',
      },
    ]);
    expect(result.warnings).toEqual([
      'Some active members were excluded because monthly finance data is missing, private, or has no remaining available amount.',
    ]);
  });

  it('prioritizes actual monthly finance values for contribution suggestions', async () => {
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
      monthlyContributionTarget: new Prisma.Decimal(4000000),
    });
    (
      prisma.familyMember as { findFirst: jest.Mock; findMany: jest.Mock }
    ).findMany.mockResolvedValue([
      {
        id: 'member-le-anh-sy',
        displayName: 'Lê Anh Sỹ',
        user: { fullName: 'Lê Anh Sỹ' },
        monthlyFinances: [
          {
            expectedIncome: new Prisma.Decimal(25000000),
            actualIncome: new Prisma.Decimal(15000000),
            expectedPersonalExpense: new Prisma.Decimal(0),
            actualPersonalExpense: new Prisma.Decimal(5000000),
            expectedSharedContribution: null,
            actualSharedContribution: null,
            incomeVisibility: FinanceVisibility.FAMILY,
            expenseVisibility: FinanceVisibility.FAMILY,
          },
        ],
      },
      {
        id: 'member-minh-nhut',
        displayName: 'Minh Nhut',
        user: { fullName: 'Minh Nhut' },
        monthlyFinances: [
          {
            expectedIncome: new Prisma.Decimal(25000000),
            actualIncome: new Prisma.Decimal(3000000),
            expectedPersonalExpense: new Prisma.Decimal(0),
            actualPersonalExpense: new Prisma.Decimal(1000000),
            expectedSharedContribution: null,
            actualSharedContribution: null,
            incomeVisibility: FinanceVisibility.FAMILY,
            expenseVisibility: FinanceVisibility.FAMILY,
          },
        ],
      },
    ]);

    const result = await financialGoalService.getGoalContributionSuggestions(
      familyId,
      memberId,
      goalId,
      { month: 9, year: 2026 },
    );

    expect(result.totalAvailableAmount).toBe(12000000);
    expect(result.suggestions).toEqual([
      expect.objectContaining({
        memberId: 'member-le-anh-sy',
        incomeAmount: 15000000,
        personalExpenseAmount: 5000000,
        incomeSource: 'ACTUAL',
        expenseSource: 'ACTUAL',
        availableAmount: 10000000,
        suggestedContribution: 3333333,
      }),
      expect.objectContaining({
        memberId: 'member-minh-nhut',
        incomeAmount: 3000000,
        personalExpenseAmount: 1000000,
        incomeSource: 'ACTUAL',
        expenseSource: 'ACTUAL',
        availableAmount: 2000000,
        suggestedContribution: 666667,
      }),
    ]);
  });

  it('uses deadline-based recommended monthly contribution when goal has no explicit monthly target', async () => {
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
      targetAmount: new Prisma.Decimal(12000000),
      deadline: new Date('2026-09-15T00:00:00.000Z'),
      monthlyContributionTarget: null,
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
            expectedIncome: new Prisma.Decimal(10000000),
            actualIncome: null,
            expectedPersonalExpense: new Prisma.Decimal(2000000),
            actualPersonalExpense: null,
            expectedSharedContribution: new Prisma.Decimal(1000000),
            actualSharedContribution: null,
            incomeVisibility: FinanceVisibility.FAMILY,
            expenseVisibility: FinanceVisibility.FAMILY,
          },
        ],
      },
    ]);

    const result = await financialGoalService.getGoalContributionSuggestions(
      familyId,
      memberId,
      goalId,
      { month: 6, year: 2026 },
    );

    expect(result.explicitMonthlyContributionTarget).toBeNull();
    expect(result.recommendedMonthlyContribution).toBe(3000000);
    expect(result.monthlyContributionTarget).toBe(3000000);
    expect(result.suggestions[0]).toMatchObject({
      memberId: 'member-a',
      sharedContributionAmount: 1000000,
      availableAmount: 7000000,
      suggestedContribution: 3000000,
    });
    expect(result.warnings).toContain(
      'Goal has no monthlyContributionTarget; suggestions use the remaining amount divided by months remaining until deadline.',
    );
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

    const result = await financialGoalService.confirmGoalContributionPlans(
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
      financialGoalService.confirmGoalContributionPlans(
        familyId,
        memberId,
        goalId,
        {
          periodMonth: 6,
          periodYear: 2026,
          dueDate: '2099-06-30',
          members: [{ memberId, plannedAmount: 100 }],
        },
      ),
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

    const result = await financialGoalService.listGoalContributionPlans(
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
      sourceId: { in: ['plan-a'] },
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

    const result = await financialGoalService.submitGoalContributionPlan(
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
      financialGoalService.submitGoalContributionPlan(
        familyId,
        memberId,
        goalId,
        'plan-id',
        { amount: 1500000 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('notifies managers with { tx } and dispatches after commit when listing plans creates a new shortage alert', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    tx.familyMember.findMany.mockResolvedValue([
      { id: memberId },
      { id: 'deputy-id' },
    ]);
    tx.financialGoal.findFirst.mockResolvedValue(goal);
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
        dueDate: new Date('2026-06-10T00:00:00.000Z'), // past due (system time 2026-06-16)
        status: GoalContributionPlanStatus.PLANNED,
        submittedAt: null,
        submittedNote: null,
        reviewedAt: null,
        reviewNote: null,
        member: {
          id: 'contributor-id',
          displayName: 'Member A',
          user: { fullName: 'User A' },
        },
      },
    ]);
    tx.goalContributionPlan.update.mockResolvedValue({});
    tx.goalAllocation.findMany.mockResolvedValue([]);
    tx.budgetAlert.findFirst.mockResolvedValue(null);
    tx.budgetAlert.create.mockResolvedValue({ id: 'shortage-alert-id' });
    tx.budgetAlert.updateMany.mockResolvedValue({ count: 0 });
    notifications.notify.mockResolvedValue({ ids: ['shortage-notif-id'] });

    const result = await financialGoalService.listGoalContributionPlans(
      familyId,
      memberId,
      goalId,
      { month: 6, year: 2026 },
    );

    expect(result.members[0].status).toBe(GoalContributionPlanStatus.MISSED);
    expect(tx.budgetAlert.create).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith(
      familyId,
      [memberId, 'deputy-id'],
      expect.objectContaining({
        type: NotificationType.FINANCE,
        priority: NotificationPriority.HIGH,
        referenceType: 'BUDGET_ALERT',
        referenceId: 'shortage-alert-id',
      }),
      { tx },
    );
    expect(notifications.dispatch).toHaveBeenCalledWith(['shortage-notif-id']);
    expect(notifications.notify.mock.invocationCallOrder[0]).toBeLessThan(
      notifications.dispatch.mock.invocationCallOrder[0],
    );
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
    // allocatedBefore already at target → milestone does not fire again
    tx.goalAllocation.aggregate.mockResolvedValue({
      _sum: { amount: new Prisma.Decimal(100) },
    });
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

    const result = await financialGoalService.approveGoalContributionPlan(
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
          sourceType: 'GOAL_CONTRIBUTION_PLAN',
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
    expect(notifications.notify).toHaveBeenCalledWith(
      familyId,
      [memberId, 'deputy-id'],
      expect.objectContaining({
        type: NotificationType.FINANCE,
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
    // allocatedBefore already at target → milestone does not fire again
    tx.goalAllocation.aggregate.mockResolvedValue({
      _sum: { amount: new Prisma.Decimal(100) },
    });
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

    const result = await financialGoalService.approveGoalContributionPlan(
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
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('notifies all active members when an approved contribution crosses the goal target', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    tx.familyMember.findMany.mockResolvedValue([
      { id: memberId },
      { id: 'contributor-id' },
    ]);
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
    // allocatedBefore below target (100) → the contribution crosses the milestone
    tx.goalAllocation.aggregate.mockResolvedValue({ _sum: { amount: null } });
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
    notifications.notify.mockResolvedValue({ ids: ['milestone-notif-id'] });

    await financialGoalService.approveGoalContributionPlan(
      familyId,
      memberId,
      goalId,
      'plan-id',
      {
        note: 'ok',
      },
    );

    expect(notifications.notify).toHaveBeenCalledWith(
      familyId,
      [memberId, 'contributor-id'],
      expect.objectContaining({
        type: NotificationType.FINANCE,
        priority: NotificationPriority.NORMAL,
        referenceType: 'FINANCIAL_GOAL',
        referenceId: goalId,
      }),
      { tx },
    );
    expect(notifications.dispatch).toHaveBeenCalledWith(['milestone-notif-id']);
    expect(notifications.notify.mock.invocationCallOrder[0]).toBeLessThan(
      notifications.dispatch.mock.invocationCallOrder[0],
    );
  });

  it('does not create ledger entries when a pending contribution was already claimed', async () => {
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
    tx.goalContributionPlan.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      financialGoalService.approveGoalContributionPlan(
        familyId,
        memberId,
        goalId,
        'plan-id',
        { note: 'ok' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.financeLedger.upsert).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(tx.goalAllocation.create).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('prevents a normal member from approving contribution plans', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MEMBER,
      status: MemberStatus.ACTIVE,
    });

    await expect(
      financialGoalService.approveGoalContributionPlan(
        familyId,
        memberId,
        goalId,
        'plan-id',
        { note: 'ok' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
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

    const result = await financialGoalService.rejectGoalContributionPlan(
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

    const result = await financialGoalService.listGoalContributionPlans(
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
