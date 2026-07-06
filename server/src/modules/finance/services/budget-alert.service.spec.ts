import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  BudgetAlertSeverity,
  BudgetAlertStatus,
  BudgetAlertType,
  FamilyRole,
  MemberStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { FinanceService } from './finance.service';

describe('FinanceService budget alerts and reports', () => {
  const familyId = 'family-id';
  const memberId = 'member-id';
  let tx: Record<string, Record<string, jest.Mock>>;
  let prisma: Record<string, unknown>;
  let notifications: { createForMembers: jest.Mock };
  let service: FinanceService;

  beforeEach(() => {
    tx = {
      familyMember: { findFirst: jest.fn() },
      budgetAlert: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      budgetPlan: { findFirst: jest.fn(), findMany: jest.fn() },
      financeLedger: { findUnique: jest.fn() },
      financialGoal: { findMany: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
      familyMember: { findFirst: jest.fn() },
      budgetAlert: { findFirst: jest.fn() },
    };
    notifications = {
      createForMembers: jest.fn().mockResolvedValue({ count: 0 }),
    };
    service = new FinanceService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
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

  it('redacts jar-linked budget lines and warnings for normal member reports', () => {
    const privateService = service as unknown as {
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
