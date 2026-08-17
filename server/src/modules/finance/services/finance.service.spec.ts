import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  BudgetPeriodType,
  BudgetPlanStatus,
  FamilyRole,
  FinanceCategoryType,
  FinanceVisibility,
  FinanceModelStatus,
  FinanceModelType,
  LedgerEntryStatus,
  LedgerEntryType,
  MemberStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { CreateFundAllocationDto } from '../dto/create-fund-allocation.dto';
import { LedgerEntryQueryDto } from '../dto/ledger-entry-query.dto';
import { FinanceReportService } from './finance-report.service';
import { FinanceService } from './finance.service';

describe('FinanceService budget planning', () => {
  const familyId = 'family-id';
  const planId = 'plan-id';
  const lineId = 'line-id';
  let tx: Record<string, Record<string, jest.Mock>>;
  let prisma: Record<string, unknown>;
  let service: FinanceService;
  let reportService: FinanceReportService;

  beforeEach(() => {
    tx = {
      familyMember: { findFirst: jest.fn(), findMany: jest.fn() },
      budgetPlan: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      budgetLine: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      financeCategory: { findFirst: jest.fn() },
      financeCategoryJarMapping: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      financeJar: { findFirst: jest.fn() },
      financeLedger: { upsert: jest.fn() },
      financeModel: { findFirst: jest.fn() },
      ledgerEntry: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };
    prisma = {
      $transaction: jest.fn(
        (operation: ((client: typeof tx) => unknown) | unknown[]) =>
          Array.isArray(operation) ? Promise.all(operation) : operation(tx),
      ),
      familyMember: { findFirst: jest.fn(), findMany: jest.fn() },
      budgetPlan: { findFirst: jest.fn() },
      financeModel: { findFirst: jest.fn() },
      financeCategoryJarMapping: { findMany: jest.fn().mockResolvedValue([]) },
      financeLedger: { findUnique: jest.fn() },
      ledgerEntry: { findMany: jest.fn(), count: jest.fn() },
    };
    service = new FinanceService(prisma as unknown as PrismaService);
    reportService = new FinanceReportService(
      prisma as unknown as PrismaService,
    );
  });

  it('lists member monthly finances for finance managers and respects visibility', async () => {
    (
      prisma.familyMember as { findFirst: jest.Mock; findMany: jest.Mock }
    ).findFirst.mockResolvedValue({
      id: 'manager-id',
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    (
      prisma.familyMember as { findFirst: jest.Mock; findMany: jest.Mock }
    ).findMany.mockResolvedValue([
      {
        id: 'member-public',
        displayName: 'Public Member',
        user: { fullName: 'Public User' },
        monthlyFinances: [
          {
            id: 'finance-public',
            memberId: 'member-public',
            periodMonth: 9,
            periodYear: 2026,
            expectedIncome: new Prisma.Decimal(14000000),
            actualIncome: new Prisma.Decimal(15000000),
            expectedPersonalExpense: new Prisma.Decimal(4000000),
            actualPersonalExpense: new Prisma.Decimal(5000000),
            expectedSharedContribution: new Prisma.Decimal(1000000),
            actualSharedContribution: new Prisma.Decimal(1200000),
            incomeVisibility: FinanceVisibility.FAMILY,
            expenseVisibility: FinanceVisibility.FAMILY,
            note: 'private note',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      },
      {
        id: 'member-private',
        displayName: 'Private Member',
        user: { fullName: 'Private User' },
        monthlyFinances: [
          {
            id: 'finance-private',
            memberId: 'member-private',
            periodMonth: 9,
            periodYear: 2026,
            expectedIncome: new Prisma.Decimal(3000000),
            actualIncome: new Prisma.Decimal(3500000),
            expectedPersonalExpense: new Prisma.Decimal(1000000),
            actualPersonalExpense: new Prisma.Decimal(1200000),
            expectedSharedContribution: null,
            actualSharedContribution: null,
            incomeVisibility: FinanceVisibility.PRIVATE,
            expenseVisibility: FinanceVisibility.PRIVATE,
            note: 'private note',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      },
    ]);

    const result = await service.listMemberMonthlyFinances(
      familyId,
      'manager-id',
      { month: 9, year: 2026 },
    );

    expect(result.scope).toBe('FAMILY_ACTIVE_MEMBERS');
    expect(result.members).toHaveLength(2);
    expect(result.members[0]).toMatchObject({
      member: { id: 'member-public', displayName: 'Public Member' },
      monthlyFinance: {
        actualIncome: 15000000,
        actualPersonalExpense: 5000000,
        actualSharedContribution: 1200000,
        note: null,
      },
      visibility: {
        incomeHidden: false,
        expenseHidden: false,
      },
    });
    expect(result.members[1]).toMatchObject({
      member: { id: 'member-private', displayName: 'Private Member' },
      monthlyFinance: {
        actualIncome: null,
        actualPersonalExpense: null,
        actualSharedContribution: null,
        note: null,
      },
      visibility: {
        incomeHidden: true,
        expenseHidden: true,
      },
    });
  });

  it('rejects a budget line without a category or jar', async () => {
    tx.budgetPlan.findFirst.mockResolvedValue({
      id: planId,
      status: BudgetPlanStatus.DRAFT,
    });

    await expect(
      service.createBudgetLine(familyId, planId, { plannedAmount: 100 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a category that does not belong to the family', async () => {
    tx.budgetPlan.findFirst.mockResolvedValue({
      id: planId,
      status: BudgetPlanStatus.DRAFT,
    });
    tx.financeCategory.findFirst.mockResolvedValue(null);

    await expect(
      service.createBudgetLine(familyId, planId, {
        categoryId: 'category-id',
        plannedAmount: 100,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects structural edits to an active budget plan', async () => {
    tx.budgetLine.findFirst.mockResolvedValue({
      id: lineId,
      categoryId: 'category-id',
      jarId: null,
      plannedAmount: new Prisma.Decimal(100),
      thresholdAmount: null,
      thresholdPercent: null,
      budgetPlan: { status: BudgetPlanStatus.ACTIVE },
    });

    await expect(
      service.updateBudgetLine(familyId, lineId, { plannedAmount: 200 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid budget period', async () => {
    tx.familyMember.findFirst.mockResolvedValue({ id: 'member-id' });

    await expect(
      service.createBudgetPlan(familyId, 'member-id', {
        planName: 'Invalid period',
        periodType: BudgetPeriodType.MONTHLY,
        periodStart: '2026-06-30',
        periodEnd: '2026-06-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects activating a plan without lines', async () => {
    tx.budgetPlan.findFirst.mockResolvedValue({
      id: planId,
      familyId,
      status: BudgetPlanStatus.DRAFT,
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      periodEnd: new Date('2026-06-30T00:00:00.000Z'),
    });
    tx.budgetLine.count.mockResolvedValue(0);

    await expect(
      service.activateBudgetPlan(familyId, planId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects activating the same family period twice', async () => {
    tx.budgetPlan.findFirst
      .mockResolvedValueOnce({
        id: planId,
        familyId,
        status: BudgetPlanStatus.DRAFT,
        periodStart: new Date('2026-06-01T00:00:00.000Z'),
        periodEnd: new Date('2026-06-30T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({ id: 'other-plan-id' });
    tx.budgetLine.count.mockResolvedValue(1);

    await expect(
      service.activateBudgetPlan(familyId, planId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('builds an inclusive hybrid planned-vs-actual report', async () => {
    (prisma.budgetPlan as { findFirst: jest.Mock }).findFirst.mockResolvedValue(
      {
        id: planId,
        familyId,
        planName: 'June plan',
        periodType: BudgetPeriodType.MONTHLY,
        periodStart: new Date('2026-06-01T00:00:00.000Z'),
        periodEnd: new Date('2026-06-30T00:00:00.000Z'),
        expectedSharedIncome: null,
        expectedSharedExpense: null,
        status: BudgetPlanStatus.ACTIVE,
        createdByMemberId: 'member-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdByMember: {
          id: 'member-id',
          displayName: null,
          user: { id: 'user-id', fullName: null, avatarUrl: null },
        },
        lines: [
          {
            id: 'income-line',
            budgetPlanId: planId,
            categoryId: 'income-category',
            jarId: null,
            plannedAmount: new Prisma.Decimal(1000),
            thresholdAmount: null,
            thresholdPercent: null,
            essentialType: null,
            note: null,
            financeLedgerId: null,
            category: {
              id: 'income-category',
              familyId,
              name: 'Salary',
              categoryType: FinanceCategoryType.INCOME,
              essentialType: 'NEUTRAL',
              status: 'ACTIVE',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            jar: null,
          },
          {
            id: 'expense-line',
            budgetPlanId: planId,
            categoryId: 'expense-category',
            jarId: null,
            plannedAmount: new Prisma.Decimal(500),
            thresholdAmount: null,
            thresholdPercent: new Prisma.Decimal(10),
            essentialType: null,
            note: null,
            financeLedgerId: null,
            category: {
              id: 'expense-category',
              familyId,
              name: 'Food',
              categoryType: FinanceCategoryType.EXPENSE,
              essentialType: 'ESSENTIAL',
              status: 'ACTIVE',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            jar: null,
          },
          {
            id: 'jar-line',
            budgetPlanId: planId,
            categoryId: null,
            jarId: 'jar-id',
            plannedAmount: new Prisma.Decimal(200),
            thresholdAmount: null,
            thresholdPercent: null,
            essentialType: null,
            note: null,
            financeLedgerId: null,
            category: null,
            jar: {
              id: 'jar-id',
              financeModelId: 'model-id',
              name: 'Savings',
              jarCode: 'SAVINGS',
              allocationPercentage: new Prisma.Decimal(20),
              description: null,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        ],
      },
    );
    (
      prisma.financeLedger as { findUnique: jest.Mock }
    ).findUnique.mockResolvedValue({ id: 'ledger-id' });
    (prisma.ledgerEntry as { findMany: jest.Mock }).findMany.mockResolvedValue([
      {
        categoryId: 'income-category',
        entryType: LedgerEntryType.CONTRIBUTION,
        amount: new Prisma.Decimal(1100),
        status: LedgerEntryStatus.ACTIVE,
      },
      {
        categoryId: 'expense-category',
        entryType: LedgerEntryType.SUPPORT,
        amount: new Prisma.Decimal(600),
        status: LedgerEntryStatus.ACTIVE,
      },
    ]);

    const report = await reportService.getBudgetPlanReport(familyId, planId);

    expect(report.totals.plannedIncome.toString()).toBe('1000');
    expect(report.totals.plannedExpense.toString()).toBe('700');
    expect(report.totals.actualIncome.toString()).toBe('1100');
    expect(report.totals.actualExpense.toString()).toBe('600');
    expect(report.lines[2].actualAmount.toString()).toBe('0');
    expect(report.lines[1].isOverBudget).toBe(true);
    expect(report.warnings[0].type).toBe('OVER_BUDGET');
    const ledgerQuery = (
      prisma.ledgerEntry as {
        findMany: jest.Mock<unknown, [Prisma.LedgerEntryFindManyArgs]>;
      }
    ).findMany.mock.calls[0][0];
    expect(ledgerQuery.where?.entryDate).toEqual({
      gte: new Date('2026-06-01T00:00:00.000Z'),
      lt: new Date('2026-07-01T00:00:00.000Z'),
    });
  });

  it('lists ledger entries with default pagination', async () => {
    const entries = [{ id: 'entry-1' }, { id: 'entry-2' }];
    (
      prisma.financeLedger as { findUnique: jest.Mock }
    ).findUnique.mockResolvedValue({ id: 'ledger-id' });
    (prisma.ledgerEntry as { findMany: jest.Mock }).findMany.mockResolvedValue(
      entries,
    );
    (prisma.ledgerEntry as { count: jest.Mock }).count.mockResolvedValue(2);

    const query = plainToInstance(LedgerEntryQueryDto, {});
    const result = await service.listLedgerEntries(familyId, query);

    expect(result).toEqual({
      items: entries,
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    expect(
      (prisma.ledgerEntry as { findMany: jest.Mock }).findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { entryDate: 'desc' }],
        skip: 0,
        take: 20,
      }),
    );
  });

  it('accepts page and limit in ledger entry query DTO', async () => {
    const query = plainToInstance(LedgerEntryQueryDto, {
      page: '1',
      limit: '20',
    });

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query.page).toBe(1);
    expect(query.limit).toBe(20);
  });

  it('rejects ledger entry limit greater than 100', async () => {
    const query = plainToInstance(LedgerEntryQueryDto, {
      page: '1',
      limit: '101',
    });

    const errors = await validate(query);

    expect(errors.some((error) => error.property === 'limit')).toBe(true);
  });

  it('lists ledger entries with pagination and month/year filter', async () => {
    const entries = [{ id: 'entry-3' }];
    (
      prisma.financeLedger as { findUnique: jest.Mock }
    ).findUnique.mockResolvedValue({ id: 'ledger-id' });
    (prisma.ledgerEntry as { findMany: jest.Mock }).findMany.mockResolvedValue(
      entries,
    );
    (prisma.ledgerEntry as { count: jest.Mock }).count.mockResolvedValue(21);

    const result = await service.listLedgerEntries(familyId, {
      page: 2,
      limit: 20,
      month: 6,
      year: 2026,
    });

    expect(result).toEqual({
      items: entries,
      total: 21,
      page: 2,
      limit: 20,
      totalPages: 2,
    });
    const findManyArgs = (
      prisma.ledgerEntry as {
        findMany: jest.Mock<unknown, [Prisma.LedgerEntryFindManyArgs]>;
      }
    ).findMany.mock.calls[0][0];
    expect(findManyArgs.skip).toBe(20);
    expect(findManyArgs.take).toBe(20);
    expect(findManyArgs.where?.entryDate).toEqual({
      gte: new Date('2026-06-01T00:00:00.000Z'),
      lt: new Date('2026-07-01T00:00:00.000Z'),
    });
    expect(
      (prisma.ledgerEntry as { count: jest.Mock }).count,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ where: findManyArgs.where }),
    );
  });

  it('returns an empty paginated response when the family has no ledger', async () => {
    (
      prisma.financeLedger as { findUnique: jest.Mock }
    ).findUnique.mockResolvedValue(null);

    await expect(
      service.listLedgerEntries(familyId, {
        page: 3,
        limit: 10,
      }),
    ).resolves.toEqual({
      items: [],
      total: 0,
      page: 3,
      limit: 10,
      totalPages: 0,
    });
    expect(
      (prisma.ledgerEntry as { findMany: jest.Mock }).findMany,
    ).not.toHaveBeenCalled();
    expect(
      (prisma.ledgerEntry as { count: jest.Mock }).count,
    ).not.toHaveBeenCalled();
  });

  it('auto-assigns a jar from the active model category mapping when creating a ledger entry', async () => {
    tx.financeLedger.upsert.mockResolvedValue({ id: 'ledger-id' });
    tx.financeCategory.findFirst.mockResolvedValue({
      id: 'category-id',
      familyId,
      status: 'ACTIVE',
    });
    tx.financeCategoryJarMapping.findFirst.mockResolvedValue({
      jarId: 'education-jar',
    });
    tx.ledgerEntry.create.mockResolvedValue({
      id: 'entry-id',
      categoryId: 'category-id',
      jarId: 'education-jar',
    });

    const result = await service.createLedgerEntry(familyId, 'member-id', {
      entryType: LedgerEntryType.EXPENSE,
      amount: 250000,
      description: 'Khóa học tiếng Anh',
      entryDate: '2026-06-10T08:30:00.000Z',
      categoryId: 'category-id',
    });

    expect(result.jarId).toBe('education-jar');
    expect(tx.financeCategoryJarMapping.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          familyId,
          categoryId: 'category-id',
          financeModel: { status: FinanceModelStatus.ACTIVE },
        }),
      }),
    );
    expect(tx.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          categoryId: 'category-id',
          jarId: 'education-jar',
        }),
      }),
    );
  });

  it('reports jar actual percentages against model target percentages', async () => {
    (
      prisma.familyMember as { findFirst: jest.Mock }
    ).findFirst.mockResolvedValue({
      id: 'member-id',
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    (prisma.budgetPlan as { findFirst: jest.Mock }).findFirst.mockResolvedValue(
      null,
    );
    (
      prisma.financeModel as { findFirst: jest.Mock }
    ).findFirst.mockResolvedValue({
      id: 'model-id',
      familyId,
      name: '80/20',
      modelType: FinanceModelType.EIGHTY_TWENTY,
      status: FinanceModelStatus.ACTIVE,
      jars: [
        {
          id: 'spending-jar',
          financeModelId: 'model-id',
          name: 'Spending',
          jarCode: 'SPENDING',
          allocationPercentage: new Prisma.Decimal(80),
          description: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'savings-jar',
          financeModelId: 'model-id',
          name: 'Savings',
          jarCode: 'SAVINGS',
          allocationPercentage: new Prisma.Decimal(20),
          description: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    (
      prisma.financeCategoryJarMapping as { findMany: jest.Mock }
    ).findMany.mockResolvedValue([
      { categoryId: 'food-category', jarId: 'spending-jar' },
    ]);
    (prisma.ledgerEntry as { findMany: jest.Mock }).findMany
      .mockResolvedValueOnce([
        {
          jarId: 'spending-jar',
          amount: new Prisma.Decimal(2400000),
          metadata: {
            fundAllocationSnapshot: {
              jar: { id: 'spending-jar' },
              amount: 2400000,
            },
          },
        },
        {
          jarId: 'savings-jar',
          amount: new Prisma.Decimal(600000),
          metadata: {
            fundAllocationSnapshot: {
              jar: { id: 'savings-jar' },
              amount: 600000,
            },
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          jarId: 'spending-jar',
          categoryId: 'food-category',
          amount: new Prisma.Decimal(110),
          category: { name: 'Food' },
        },
        {
          jarId: 'savings-jar',
          categoryId: 'saving-category',
          amount: new Prisma.Decimal(0),
          category: { name: 'Saving' },
        },
        {
          jarId: null,
          categoryId: 'food-category',
          amount: new Prisma.Decimal(100),
          category: { name: 'Food' },
        },
        {
          jarId: null,
          categoryId: null,
          amount: new Prisma.Decimal(10),
          category: null,
        },
      ]);

    const report = await reportService.getJarTargetActualReport(
      familyId,
      'member-id',
      {
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
      },
    );

    expect(report.totals.trackedAmount.toString()).toBe('220');
    expect(report.totals.mappedAmount.toString()).toBe('210');
    expect(report.totals.unmappedAmount.toString()).toBe('10');
    expect(report.items[0].targetAmount.toString()).toBe('2400000');
    expect(report.items[0].actualAmount.toString()).toBe('210');
    expect(report.items[0].actualPercentage.toNumber()).toBeCloseTo(95.454, 2);
    expect(report.items[0].variancePercentage.toNumber()).toBeCloseTo(
      15.454,
      2,
    );
    expect(report.items[0].categories[0]).toMatchObject({
      categoryId: 'food-category',
      name: 'Food',
      entryCount: 2,
    });
    expect(report.items[0].categories[0].amount.toString()).toBe('210');
    expect(report.items[0].status).toBe('OVER_TARGET');
    expect(report.items[1].targetAmount.toString()).toBe('600000');
    expect(report.items[1].status).toBe('UNDER_TARGET');
    expect(report.unmapped.percentage.toNumber()).toBeCloseTo(4.545, 2);
    expect(
      (prisma.financeCategoryJarMapping as { findMany: jest.Mock }).findMany,
    ).toHaveBeenCalledWith({
      where: {
        familyId,
        financeModelId: 'model-id',
        jarId: { in: ['spending-jar', 'savings-jar'] },
      },
      select: { categoryId: true, jarId: true },
    });
    const allocationTargetQuery = (
      prisma.ledgerEntry as {
        findMany: jest.Mock<unknown, [Prisma.LedgerEntryFindManyArgs]>;
      }
    ).findMany.mock.calls[0][0];
    expect(allocationTargetQuery.where).toMatchObject({
      sourceType: 'MODEL_FUND_ALLOCATION',
      sourceId: { in: ['model-id:2026-06'] },
    });
    const jarReportQuery = (
      prisma.ledgerEntry as {
        findMany: jest.Mock<unknown, [Prisma.LedgerEntryFindManyArgs]>;
      }
    ).findMany.mock.calls[1][0];
    expect(jarReportQuery.where?.sourceType).toBeUndefined();
    expect(
      (prisma.ledgerEntry as { findMany: jest.Mock }).findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entryType: {
            in: [
              LedgerEntryType.EXPENSE,
              LedgerEntryType.SUPPORT,
              LedgerEntryType.ALLOWANCE,
              LedgerEntryType.REWARD,
            ],
          },
        }),
      }),
    );
  });

  it('allocates a fund across active jars by model percentages', async () => {
    const modelId = 'model-id';
    const memberId = 'member-id';
    const createdAt = new Date('2026-07-28T00:00:00.000Z');
    tx.financeModel.findFirst.mockResolvedValue({
      id: modelId,
      name: 'Five Jars',
      modelType: 'FIVE_JARS',
      status: FinanceModelStatus.ACTIVE,
      jars: [
        {
          id: 'necessities-jar',
          name: 'Necessities',
          jarCode: 'NECESSITIES',
          allocationPercentage: new Prisma.Decimal(50),
        },
        {
          id: 'savings-jar',
          name: 'Savings',
          jarCode: 'SAVINGS',
          allocationPercentage: new Prisma.Decimal(20),
        },
        {
          id: 'education-jar',
          name: 'Education',
          jarCode: 'EDUCATION',
          allocationPercentage: new Prisma.Decimal(10),
        },
        {
          id: 'enjoyment-jar',
          name: 'Enjoyment',
          jarCode: 'ENJOYMENT',
          allocationPercentage: new Prisma.Decimal(10),
        },
        {
          id: 'giving-jar',
          name: 'Giving',
          jarCode: 'GIVING',
          allocationPercentage: new Prisma.Decimal(10),
        },
      ],
    });
    tx.ledgerEntry.findFirst.mockResolvedValue(null);
    tx.ledgerEntry.findMany.mockResolvedValue([
      {
        entryType: LedgerEntryType.CONTRIBUTION,
        amount: new Prisma.Decimal(10000000),
        sourceType: null,
      },
    ]);
    tx.financeLedger.upsert.mockResolvedValue({ id: 'ledger-id' });
    const createLedgerEntryMock = tx.ledgerEntry.create as jest.Mock<
      Promise<{
        id: string;
        createdAt: Date;
        jar: { id: string | null };
      }>,
      [Prisma.LedgerEntryCreateArgs]
    >;
    createLedgerEntryMock.mockImplementation((args) =>
      Promise.resolve({
        id: `entry-${String(args.data.jarId)}`,
        createdAt,
        jar: {
          id: typeof args.data.jarId === 'string' ? args.data.jarId : null,
        },
      }),
    );

    const result = await service.allocateFundByModel(familyId, memberId, {
      modelId,
      amount: 10000000,
      periodMonth: 7,
      periodYear: 2026,
      note: 'Chia quy thang 7',
    });

    expect(result.totalAmount).toBe(10000000);
    expect(result.createdAt).toBe(createdAt);
    expect(result.createdByMemberId).toBe(memberId);
    expect(result.note).toBe('Chia quy thang 7');
    expect(result.sourceType).toBe('MODEL_FUND_ALLOCATION');
    expect(result.sourceId).toBe(`${modelId}:2026-07`);
    expect(result.items.map((item) => item.amount)).toEqual([
      5000000, 2000000, 1000000, 1000000, 1000000,
    ]);
    expect(createLedgerEntryMock).toHaveBeenCalledTimes(5);
    const createdAmounts = createLedgerEntryMock.mock.calls.map(([args]) => {
      const { amount } = args.data;
      if (amount instanceof Prisma.Decimal) {
        return amount.toString();
      }
      if (typeof amount === 'number' || typeof amount === 'string') {
        return amount.toString();
      }
      return 'unsupported-amount';
    });
    expect(createdAmounts).toEqual([
      '5000000',
      '2000000',
      '1000000',
      '1000000',
      '1000000',
    ]);
    expect(createLedgerEntryMock.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        ledgerId: 'ledger-id',
        jarId: 'necessities-jar',
        createdByMemberId: memberId,
        entryType: LedgerEntryType.ADJUSTMENT,
        sourceType: 'MODEL_FUND_ALLOCATION',
        sourceId: `${modelId}:2026-07`,
        status: LedgerEntryStatus.ACTIVE,
      }),
    );
  });

  it('rejects fund allocation when the family already allocated the same period with another model', async () => {
    const modelId = 'model-b-id';
    tx.financeModel.findFirst.mockResolvedValue({
      id: modelId,
      name: '80/20',
      modelType: 'EIGHTY_TWENTY',
      status: FinanceModelStatus.ACTIVE,
      jars: [
        {
          id: 'jar-id',
          financeModelId: modelId,
          name: 'Needs',
          jarCode: 'NEEDS',
          allocationPercentage: new Prisma.Decimal(100),
          description: null,
          isActive: true,
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
          updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
      ],
    });
    tx.ledgerEntry.findFirst.mockResolvedValue({ id: 'entry-from-model-a' });

    await expect(
      service.allocateFundByModel(familyId, 'member-id', {
        modelId,
        amount: 10000000,
        periodMonth: 7,
        periodYear: 2026,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'Kỳ này đã có lần chia quỹ',
        code: 'FUND_ALLOCATION_ALREADY_EXISTS',
      }),
    });
    expect(tx.ledgerEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceType: 'MODEL_FUND_ALLOCATION',
          sourceId: { endsWith: ':2026-07' },
        }),
      }),
    );
    expect(tx.financeLedger.upsert).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('rejects fund allocation when active jar percentages do not total 100', async () => {
    tx.financeModel.findFirst.mockResolvedValue({
      id: 'model-id',
      name: 'Custom',
      modelType: 'CUSTOM',
      status: FinanceModelStatus.ACTIVE,
      jars: [
        {
          id: 'jar-id',
          name: 'Savings',
          jarCode: 'SAVINGS',
          allocationPercentage: new Prisma.Decimal(80),
        },
      ],
    });

    await expect(
      service.allocateFundByModel(familyId, 'member-id', {
        amount: 10000000,
        periodMonth: 7,
        periodYear: 2026,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVALID_JAR_PERCENTAGE',
      }),
    });
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('rejects fund allocation when requested amount exceeds available family fund', async () => {
    const modelId = 'model-id';
    tx.financeModel.findFirst.mockResolvedValue({
      id: modelId,
      name: 'Five Jars',
      modelType: 'FIVE_JARS',
      status: FinanceModelStatus.ACTIVE,
      jars: [
        {
          id: 'necessities-jar',
          financeModelId: modelId,
          name: 'Necessities',
          jarCode: 'NECESSITIES',
          allocationPercentage: new Prisma.Decimal(100),
          description: null,
          isActive: true,
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
          updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
      ],
    });
    tx.ledgerEntry.findFirst.mockResolvedValue(null);
    tx.financeLedger.upsert.mockResolvedValue({ id: 'ledger-id' });
    tx.ledgerEntry.findMany.mockResolvedValue([
      {
        entryType: LedgerEntryType.CONTRIBUTION,
        amount: new Prisma.Decimal(1000000),
        sourceType: null,
      },
    ]);

    await expect(
      service.allocateFundByModel(familyId, 'member-id', {
        modelId,
        amount: 10000000,
        periodMonth: 7,
        periodYear: 2026,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INSUFFICIENT_AVAILABLE_FUND',
        requestedAmount: 10000000,
        availableAmount: 1000000,
        periodMonth: 7,
        periodYear: 2026,
      }),
    });
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('propagates fund allocation entry creation failures so the transaction rolls back', async () => {
    const modelId = 'model-id';
    tx.financeModel.findFirst.mockResolvedValue({
      id: modelId,
      name: 'Five Jars',
      modelType: 'FIVE_JARS',
      status: FinanceModelStatus.ACTIVE,
      jars: [
        {
          id: 'necessities-jar',
          financeModelId: modelId,
          name: 'Necessities',
          jarCode: 'NECESSITIES',
          allocationPercentage: new Prisma.Decimal(50),
          description: null,
          isActive: true,
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
          updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          id: 'savings-jar',
          financeModelId: modelId,
          name: 'Savings',
          jarCode: 'SAVINGS',
          allocationPercentage: new Prisma.Decimal(30),
          description: null,
          isActive: true,
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
          updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          id: 'education-jar',
          financeModelId: modelId,
          name: 'Education',
          jarCode: 'EDUCATION',
          allocationPercentage: new Prisma.Decimal(20),
          description: null,
          isActive: true,
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
          updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
      ],
    });
    tx.ledgerEntry.findFirst.mockResolvedValue(null);
    tx.financeLedger.upsert.mockResolvedValue({ id: 'ledger-id' });
    tx.ledgerEntry.findMany.mockResolvedValue([
      {
        entryType: LedgerEntryType.CONTRIBUTION,
        amount: new Prisma.Decimal(10000000),
        sourceType: null,
      },
    ]);
    tx.ledgerEntry.create
      .mockResolvedValueOnce({ id: 'entry-necessities', jar: {} })
      .mockResolvedValueOnce({ id: 'entry-savings', jar: {} })
      .mockRejectedValueOnce(new Error('ledger entry write failed'));

    await expect(
      service.allocateFundByModel(familyId, 'member-id', {
        modelId,
        amount: 10000000,
        periodMonth: 7,
        periodYear: 2026,
      }),
    ).rejects.toThrow('ledger entry write failed');
    expect(tx.ledgerEntry.create).toHaveBeenCalledTimes(3);
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    );
  });

  it('lists fund allocations grouped by model and period', async () => {
    const modelId = 'model-id';
    const createdAt = new Date('2026-07-28T00:00:00.000Z');
    (prisma.ledgerEntry as { findMany: jest.Mock }).findMany.mockResolvedValue([
      {
        id: 'entry-necessities',
        ledgerId: 'ledger-id',
        categoryId: null,
        jarId: 'necessities-jar',
        createdByMemberId: 'member-id',
        entryType: LedgerEntryType.ADJUSTMENT,
        amount: new Prisma.Decimal(5000000),
        description: 'Chia quỹ vào hũ Necessities',
        note: 'Chia quỹ tháng 7',
        entryDate: new Date('2026-07-31T00:00:00.000Z'),
        status: LedgerEntryStatus.ACTIVE,
        sourceType: 'MODEL_FUND_ALLOCATION',
        sourceId: `${modelId}:2026-07`,
        metadata: {
          fundAllocationSnapshot: {
            model: {
              id: modelId,
              name: 'Five Jars',
              modelType: 'FIVE_JARS',
            },
            period: { month: 7, year: 2026 },
            sourceType: 'MODEL_FUND_ALLOCATION',
            sourceId: `${modelId}:2026-07`,
            jar: {
              id: 'necessities-jar',
              financeModelId: modelId,
              name: 'Necessities',
              jarCode: 'NECESSITIES',
              allocationPercentage: 50,
              description: null,
              isActive: true,
              createdAt: createdAt.toISOString(),
              updatedAt: createdAt.toISOString(),
            },
            amount: 5000000,
          },
        },
        createdAt,
        updatedAt: createdAt,
        jar: {
          id: 'necessities-jar',
          financeModelId: modelId,
          name: 'Renamed Necessities',
          jarCode: 'NECESSITIES',
          allocationPercentage: new Prisma.Decimal(60),
          description: null,
          isActive: true,
          createdAt,
          updatedAt: createdAt,
          financeModel: {
            id: modelId,
            name: 'Renamed Five Jars',
            modelType: 'FIVE_JARS',
          },
        },
      },
      {
        id: 'entry-savings',
        ledgerId: 'ledger-id',
        categoryId: null,
        jarId: 'savings-jar',
        createdByMemberId: 'member-id',
        entryType: LedgerEntryType.ADJUSTMENT,
        amount: new Prisma.Decimal(5000000),
        description: 'Chia quỹ vào hũ Savings',
        note: 'Chia quỹ tháng 7',
        entryDate: new Date('2026-07-31T00:00:00.000Z'),
        status: LedgerEntryStatus.ACTIVE,
        sourceType: 'MODEL_FUND_ALLOCATION',
        sourceId: `${modelId}:2026-07`,
        metadata: {
          fundAllocationSnapshot: {
            model: {
              id: modelId,
              name: 'Five Jars',
              modelType: 'FIVE_JARS',
            },
            period: { month: 7, year: 2026 },
            sourceType: 'MODEL_FUND_ALLOCATION',
            sourceId: `${modelId}:2026-07`,
            jar: {
              id: 'savings-jar',
              financeModelId: modelId,
              name: 'Savings',
              jarCode: 'SAVINGS',
              allocationPercentage: 50,
              description: null,
              isActive: true,
              createdAt: createdAt.toISOString(),
              updatedAt: createdAt.toISOString(),
            },
            amount: 5000000,
          },
        },
        createdAt,
        updatedAt: createdAt,
        jar: {
          id: 'savings-jar',
          financeModelId: modelId,
          name: 'Renamed Savings',
          jarCode: 'SAVINGS',
          allocationPercentage: new Prisma.Decimal(40),
          description: null,
          isActive: true,
          createdAt,
          updatedAt: createdAt,
          financeModel: {
            id: modelId,
            name: 'Renamed Five Jars',
            modelType: 'FIVE_JARS',
          },
        },
      },
    ]);

    const result = await service.listFundAllocations(familyId, {
      modelId,
      periodMonth: 7,
      periodYear: 2026,
      page: 1,
      limit: 20,
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      model: { id: modelId, name: 'Five Jars', modelType: 'FIVE_JARS' },
      period: { month: 7, year: 2026 },
      totalAmount: 10000000,
      createdAt,
      createdByMemberId: 'member-id',
      note: 'Chia quỹ tháng 7',
      sourceType: 'MODEL_FUND_ALLOCATION',
      sourceId: `${modelId}:2026-07`,
    });
    expect(result.items[0].items).toHaveLength(2);
    expect(result.items[0].items[0]).toMatchObject({
      jarName: 'Necessities',
      allocationPercentage: 50,
      amount: 5000000,
    });
    expect(result.items[0].entries[0]).toMatchObject({
      id: 'entry-necessities',
      entryType: LedgerEntryType.ADJUSTMENT,
      sourceType: 'MODEL_FUND_ALLOCATION',
      jar: {
        name: 'Necessities',
        allocationPercentage: 50,
      },
    });
    expect(
      (prisma.ledgerEntry as { findMany: jest.Mock }).findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceType: 'MODEL_FUND_ALLOCATION',
          sourceId: expect.objectContaining({ equals: `${modelId}:2026-07` }),
        }),
      }),
    );
  });

  it('sorts fund allocation history by allocation createdAt descending', async () => {
    const olderCreatedAt = new Date('2026-07-01T00:00:00.000Z');
    const newerCreatedAt = new Date('2026-07-28T00:00:00.000Z');
    (prisma.ledgerEntry as { findMany: jest.Mock }).findMany.mockResolvedValue([
      {
        id: 'old-entry',
        ledgerId: 'ledger-id',
        categoryId: null,
        jarId: 'old-jar',
        createdByMemberId: 'member-id',
        entryType: LedgerEntryType.ADJUSTMENT,
        amount: new Prisma.Decimal(1000000),
        description: 'Old allocation',
        note: null,
        entryDate: new Date('2026-07-31T00:00:00.000Z'),
        status: LedgerEntryStatus.ACTIVE,
        sourceType: 'MODEL_FUND_ALLOCATION',
        sourceId: 'old-model:2026-07',
        metadata: null,
        createdAt: olderCreatedAt,
        updatedAt: olderCreatedAt,
        jar: {
          id: 'old-jar',
          financeModelId: 'old-model',
          name: 'Old Jar',
          jarCode: 'OLD',
          allocationPercentage: new Prisma.Decimal(100),
          description: null,
          isActive: true,
          createdAt: olderCreatedAt,
          updatedAt: olderCreatedAt,
          financeModel: {
            id: 'old-model',
            name: 'Old Model',
            modelType: 'FIVE_JARS',
          },
        },
      },
      {
        id: 'new-entry',
        ledgerId: 'ledger-id',
        categoryId: null,
        jarId: 'new-jar',
        createdByMemberId: 'member-id',
        entryType: LedgerEntryType.ADJUSTMENT,
        amount: new Prisma.Decimal(2000000),
        description: 'New allocation',
        note: 'Latest',
        entryDate: new Date('2026-08-31T00:00:00.000Z'),
        status: LedgerEntryStatus.ACTIVE,
        sourceType: 'MODEL_FUND_ALLOCATION',
        sourceId: 'new-model:2026-08',
        metadata: null,
        createdAt: newerCreatedAt,
        updatedAt: newerCreatedAt,
        jar: {
          id: 'new-jar',
          financeModelId: 'new-model',
          name: 'New Jar',
          jarCode: 'NEW',
          allocationPercentage: new Prisma.Decimal(100),
          description: null,
          isActive: true,
          createdAt: newerCreatedAt,
          updatedAt: newerCreatedAt,
          financeModel: {
            id: 'new-model',
            name: 'New Model',
            modelType: 'EIGHTY_TWENTY',
          },
        },
      },
    ]);

    const result = await service.listFundAllocations(familyId, {
      page: 1,
      limit: 20,
    });

    expect(result.items.map((item) => item.sourceId)).toEqual([
      'new-model:2026-08',
      'old-model:2026-07',
    ]);
    expect(result.items[0]).toMatchObject({
      createdAt: newerCreatedAt,
      createdByMemberId: 'member-id',
      note: 'Latest',
    });
  });

  it('keeps legacy fund allocation history when snapshot and jar data are missing', async () => {
    const createdAt = new Date('2026-10-05T00:00:00.000Z');
    (prisma.ledgerEntry as { findMany: jest.Mock }).findMany.mockResolvedValue([
      {
        id: 'legacy-entry',
        ledgerId: 'ledger-id',
        categoryId: null,
        jarId: null,
        createdByMemberId: 'member-id',
        entryType: LedgerEntryType.ADJUSTMENT,
        amount: new Prisma.Decimal(1234567),
        description: 'Legacy allocation',
        note: null,
        entryDate: new Date('2026-10-31T00:00:00.000Z'),
        status: LedgerEntryStatus.ACTIVE,
        sourceType: 'MODEL_FUND_ALLOCATION',
        sourceId: 'legacy-model:2026-10',
        metadata: null,
        createdAt,
        updatedAt: createdAt,
        jar: null,
      },
    ]);

    const result = await service.listFundAllocations(familyId, {
      page: 1,
      limit: 20,
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      model: { id: 'legacy-model', name: null, modelType: null },
      period: { month: 10, year: 2026 },
      totalAmount: 1234567,
      createdAt,
      createdByMemberId: 'member-id',
      note: null,
      sourceType: 'MODEL_FUND_ALLOCATION',
      sourceId: 'legacy-model:2026-10',
      items: [
        {
          jarId: null,
          jarName: null,
          jarCode: null,
          allocationPercentage: null,
          amount: 1234567,
          ledgerEntryId: 'legacy-entry',
        },
      ],
      entries: [
        expect.objectContaining({
          id: 'legacy-entry',
          jar: null,
        }),
      ],
    });
  });

  it('rejects fund allocation history period filters without both month and year', async () => {
    await expect(
      service.listFundAllocations(familyId, {
        periodMonth: 7,
        page: 1,
        limit: 20,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a valid fund allocation DTO', async () => {
    const dto = plainToInstance(CreateFundAllocationDto, {
      modelId: '51e6dd2e-75dc-4de0-9369-6c8cbd06d0a1',
      amount: '10000000',
      periodMonth: '7',
      periodYear: '2026',
      note: 'Chia quy thang 7',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.amount).toBe(10000000);
    expect(dto.periodMonth).toBe(7);
    expect(dto.periodYear).toBe(2026);
  });
});
