import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  FamilyRole,
  FinancialGoalStatus,
  LedgerEntryStatus,
  LedgerEntryType,
  MemberStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { FinanceService } from './finance.service';

describe('FinanceService financial goals', () => {
  const familyId = 'family-id';
  const memberId = 'member-id';
  const goalId = 'goal-id';
  let tx: Record<string, Record<string, jest.Mock>>;
  let prisma: Record<string, unknown>;
  let service: FinanceService;

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
      familyMember: { findFirst: jest.fn() },
      financialGoal: {
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      ledgerEntry: { findFirst: jest.fn() },
      goalAllocation: {
        aggregate: jest.fn(),
        create: jest.fn(),
      },
    };
    prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
      familyMember: { findFirst: jest.fn() },
      financialGoal: { findFirst: jest.fn() },
      goalAllocation: { aggregate: jest.fn() },
    };
    service = new FinanceService(prisma as unknown as PrismaService);
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
});
