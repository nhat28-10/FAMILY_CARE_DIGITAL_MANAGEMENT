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
  FinanceCategoryType,
  LedgerEntryStatus,
  LedgerEntryType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { LedgerEntryQueryDto } from '../dto/ledger-entry-query.dto';
import { FinanceService } from './finance.service';

describe('FinanceService budget planning', () => {
  const familyId = 'family-id';
  const planId = 'plan-id';
  const lineId = 'line-id';
  let tx: Record<string, Record<string, jest.Mock>>;
  let prisma: Record<string, unknown>;
  let notifications: { createForMembers: jest.Mock };
  let service: FinanceService;

  beforeEach(() => {
    tx = {
      familyMember: { findFirst: jest.fn() },
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
      financeJar: { findFirst: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn(
        (operation: ((client: typeof tx) => unknown) | unknown[]) =>
          Array.isArray(operation) ? Promise.all(operation) : operation(tx),
      ),
      financeLedger: { findUnique: jest.fn() },
      ledgerEntry: { findMany: jest.fn(), count: jest.fn() },
    };
    notifications = {
      createForMembers: jest.fn().mockResolvedValue({ count: 0 }),
    };
    service = new FinanceService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
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
    jest.spyOn(service, 'getBudgetPlan').mockResolvedValue({
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
    });
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

    const report = await service.getBudgetPlanReport(familyId, planId);

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
});
