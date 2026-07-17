import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  BudgetAlertSeverity,
  BudgetAlertStatus,
  BudgetAlertType,
  FamilyRole,
  MemberStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { BudgetAlertService } from './budget-alert.service';
import { FinanceReportService } from './finance-report.service';

describe('BudgetAlertService budget alerts', () => {
  const familyId = 'family-id';
  const memberId = 'member-id';
  let tx: Record<string, Record<string, jest.Mock>>;
  let prisma: Record<string, unknown>;
  let service: BudgetAlertService;

  beforeEach(() => {
    tx = {
      familyMember: { findFirst: jest.fn(), findMany: jest.fn() },
      budgetAlert: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      budgetPlan: { findFirst: jest.fn(), findMany: jest.fn() },
      financeLedger: { findUnique: jest.fn() },
      financialGoal: { findMany: jest.fn(), update: jest.fn() },
      goalAllocation: { aggregate: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
      familyMember: { findFirst: jest.fn() },
      budgetAlert: { findFirst: jest.fn() },
    };
    service = new BudgetAlertService(prisma as unknown as PrismaService);
  });

  it('does not let normal members view jar-linked alerts', async () => {
    (
      prisma.familyMember as { findFirst: jest.Mock }
    ).findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MEMBER,
      status: MemberStatus.ACTIVE,
    });
    (
      prisma.budgetAlert as { findFirst: jest.Mock }
    ).findFirst.mockResolvedValue({
      id: 'alert-id',
      familyId,
      jarId: 'jar-id',
      goal: null,
    });

    await expect(
      service.getBudgetAlert(familyId, memberId, 'alert-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects acknowledging a resolved alert', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    tx.budgetAlert.findFirst.mockResolvedValue({
      id: 'alert-id',
      status: BudgetAlertStatus.RESOLVED,
    });

    await expect(
      service.acknowledgeBudgetAlert(familyId, memberId, 'alert-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates an existing acknowledged alert instead of creating a duplicate', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    tx.budgetPlan.findMany.mockResolvedValue([]);
    tx.budgetPlan.findFirst.mockResolvedValue(null);
    tx.financialGoal.findMany.mockResolvedValue([]);
    tx.budgetAlert.findFirst.mockResolvedValue({
      id: 'alert-id',
      status: BudgetAlertStatus.ACKNOWLEDGED,
    });
    tx.budgetAlert.updateMany.mockResolvedValue({ count: 0 });

    const privateService = service as unknown as {
      syncAlertCandidates(
        client: typeof tx,
        targetFamilyId: string,
        candidates: Array<{
          sourceKey: string;
          alertType: BudgetAlertType;
          severity: BudgetAlertSeverity;
          thresholdValue: Prisma.Decimal;
          actualValue: Prisma.Decimal;
          message: string;
        }>,
        dto: { scope: 'BUDGET' },
      ): Promise<unknown>;
    };
    await privateService.syncAlertCandidates(
      tx,
      familyId,
      [
        {
          sourceKey: 'OVER_BUDGET:plan:line',
          alertType: BudgetAlertType.OVER_BUDGET,
          severity: BudgetAlertSeverity.HIGH,
          thresholdValue: new Prisma.Decimal(100),
          actualValue: new Prisma.Decimal(150),
          message: 'Vượt ngân sách',
        },
      ],
      { scope: 'BUDGET' },
    );

    expect(tx.budgetAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'alert-id' } }),
    );
    expect(tx.budgetAlert.create).not.toHaveBeenCalled();
  });

  it('updates the active alert when create hits a unique race', async () => {
    tx.budgetAlert.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'alert-id',
      status: BudgetAlertStatus.NEW,
    });
    tx.budgetAlert.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );
    tx.budgetAlert.updateMany.mockResolvedValue({ count: 0 });

    const privateService = service as unknown as {
      syncAlertCandidates(
        client: typeof tx,
        targetFamilyId: string,
        candidates: Array<{
          sourceKey: string;
          alertType: BudgetAlertType;
          severity: BudgetAlertSeverity;
          thresholdValue: Prisma.Decimal;
          actualValue: Prisma.Decimal;
          message: string;
        }>,
        dto: { scope: 'BUDGET' },
      ): Promise<unknown>;
    };
    await privateService.syncAlertCandidates(
      tx,
      familyId,
      [
        {
          sourceKey: 'OVER_BUDGET:plan:line',
          alertType: BudgetAlertType.OVER_BUDGET,
          severity: BudgetAlertSeverity.HIGH,
          thresholdValue: new Prisma.Decimal(100),
          actualValue: new Prisma.Decimal(150),
          message: 'Vuot ngan sach',
        },
      ],
      { scope: 'BUDGET' },
    );

    expect(tx.budgetAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'alert-id' },
        data: expect.objectContaining({
          severity: BudgetAlertSeverity.HIGH,
          thresholdValue: new Prisma.Decimal(100),
          actualValue: new Prisma.Decimal(150),
          message: 'Vuot ngan sach',
        }),
      }),
    );
    expect(tx.budgetAlert.create).toHaveBeenCalledTimes(1);
  });

  it('uses high severity when threshold is zero and actual is positive', () => {
    const privateService = service as unknown as {
      calculateAlertSeverity(
        threshold: Prisma.Decimal,
        actual: Prisma.Decimal,
      ): BudgetAlertSeverity;
    };

    expect(
      privateService.calculateAlertSeverity(
        new Prisma.Decimal(0),
        new Prisma.Decimal(1),
      ),
    ).toBe(BudgetAlertSeverity.HIGH);
  });

  it('resolves stale alerts within the recomputed scope', async () => {
    tx.budgetAlert.updateMany.mockResolvedValue({ count: 2 });
    const privateService = service as unknown as {
      syncAlertCandidates(
        client: typeof tx,
        targetFamilyId: string,
        candidates: [],
        dto: {
          scope: 'NON_ESSENTIAL';
          periodStart: string;
          periodEnd: string;
        },
      ): Promise<{ candidates: number; resolved: number }>;
    };

    const result = await privateService.syncAlertCandidates(tx, familyId, [], {
      scope: 'NON_ESSENTIAL',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
    });

    expect(result).toEqual({ candidates: 0, resolved: 2 });
    const updateArgs = (
      tx.budgetAlert.updateMany as jest.Mock<
        unknown,
        [Prisma.BudgetAlertUpdateManyArgs]
      >
    ).mock.calls[0][0];
    expect(updateArgs.where?.familyId).toBe(familyId);
    expect(updateArgs.where?.OR).toEqual([
      {
        alertType: BudgetAlertType.NON_ESSENTIAL_TOO_HIGH,
        sourceKey: {
          startsWith: 'NON_ESSENTIAL_TOO_HIGH:2026-06-01:2026-06-30:',
        },
      },
    ]);
  });

  it('notifies finance managers/deputies with { tx } when recomputing creates a new alert, then dispatches after commit', async () => {
    tx.familyMember.findFirst.mockResolvedValue({
      id: memberId,
      familyId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });
    tx.familyMember.findMany.mockResolvedValue([{ id: memberId }]);
    tx.financialGoal.findMany.mockResolvedValue([
      {
        id: 'goal-id',
        familyId,
        goalName: 'Emergency fund',
        targetAmount: new Prisma.Decimal(1000),
        deadline: new Date('2020-01-01T00:00:00.000Z'),
        monthlyContributionTarget: null,
        relatedJarId: null,
        status: 'ACTIVE',
        relatedJar: null,
      },
    ]);
    tx.goalAllocation.aggregate.mockResolvedValue({
      _sum: { amount: new Prisma.Decimal(0) },
    });
    tx.financialGoal.update.mockResolvedValue({});
    tx.budgetAlert.findFirst.mockResolvedValue(null);
    tx.budgetAlert.create.mockResolvedValue({ id: 'alert-id' });
    tx.budgetAlert.updateMany.mockResolvedValue({ count: 0 });
    notifications.notify.mockResolvedValue({ ids: ['notif-id-1'] });

    const result = await service.recomputeBudgetGoalAlerts(familyId, memberId, {
      scope: 'GOAL',
    });

    expect(result.candidates).toBe(1);
    expect(tx.budgetAlert.create).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith(
      familyId,
      [memberId],
      expect.objectContaining({
        type: NotificationType.FINANCE,
        referenceType: 'BUDGET_ALERT',
        referenceId: 'alert-id',
      }),
      { tx },
    );
    expect(notifications.dispatch).toHaveBeenCalledWith(['notif-id-1']);
    expect(notifications.notify.mock.invocationCallOrder[0]).toBeLessThan(
      notifications.dispatch.mock.invocationCallOrder[0],
    );
  });

  it('redacts jar-linked budget lines and warnings for normal member reports', () => {
    const financeReportService = new FinanceReportService(
      prisma as unknown as PrismaService,
    );
    const privateService = financeReportService as unknown as {
      redactJarBudgetReport(report: {
        budgetPlan: {
          lines: Array<{ id: string; jarId: string | null }>;
        };
        lines: Array<{ budgetLine: { id: string; jarId: string | null } }>;
        warnings: Array<{ budgetLineId?: string }>;
      }): {
        budgetPlan: { lines: Array<{ id: string }> };
        lines: Array<{ budgetLine: { id: string } }>;
        warnings: Array<{ budgetLineId?: string }>;
      };
    };
    const report = privateService.redactJarBudgetReport({
      budgetPlan: {
        lines: [
          { id: 'category-line', jarId: null },
          { id: 'jar-line', jarId: 'jar-id' },
        ],
      },
      lines: [
        { budgetLine: { id: 'category-line', jarId: null } },
        { budgetLine: { id: 'jar-line', jarId: 'jar-id' } },
      ],
      warnings: [
        { budgetLineId: 'category-line' },
        { budgetLineId: 'jar-line' },
      ],
    });

    expect(report.budgetPlan.lines.map((line) => line.id)).toEqual([
      'category-line',
    ]);
    expect(report.lines.map((line) => line.budgetLine.id)).toEqual([
      'category-line',
    ]);
    expect(report.warnings).toEqual([{ budgetLineId: 'category-line' }]);
  });
});
