import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import {
  BudgetAlertSeverity,
  BudgetAlertStatus,
  BudgetAlertType,
  BudgetPlanStatus,
  EssentialType,
  FamilyRole,
  FinanceCategoryType,
  FinancialGoalStatus,
  LedgerEntryStatus,
  LedgerEntryType,
  MemberStatus,
  NotificationPriority,
  NotificationType,
  Prisma,
} from '@prisma/client';

import {
  buildPaginated,
  skipFor,
} from '../../../common/types/paginated-result';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { BudgetAlertQueryDto } from '../dto/budget-alert-query.dto';
import { RecomputeBudgetAlertsDto } from '../dto/recompute-budget-alerts.dto';
import { ResolveBudgetAlertDto } from '../dto/resolve-budget-alert.dto';

type FinancialGoalWithJar = Prisma.FinancialGoalGetPayload<{
  include: { relatedJar: true };
}>;

type AlertCandidate = {
  sourceKey: string;
  alertType: BudgetAlertType;
  severity: BudgetAlertSeverity;
  budgetPlanId?: string;
  goalId?: string;
  jarId?: string;
  categoryId?: string;
  thresholdValue?: Prisma.Decimal;
  actualValue?: Prisma.Decimal;
  message: string;
};

@Injectable()
export class BudgetAlertService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listBudgetAlerts(
    familyId: string,
    memberId: string,
    query: BudgetAlertQueryDto,
  ) {
    const member = await this.getMemberInFamilyOrThrow(familyId, memberId);
    const where: Prisma.BudgetAlertWhereInput = {
      familyId,
      status: query.status,
      alertType: query.alertType,
      severity: query.severity,
      budgetPlanId: query.budgetPlanId,
      goalId: query.goalId,
      jarId: query.jarId,
      categoryId: query.categoryId,
      createdAt:
        query.fromDate || query.toDate
          ? {
              gte: query.fromDate ? this.toDateOnly(query.fromDate) : undefined,
              lt: query.toDate
                ? this.nextUtcDay(this.toDateOnly(query.toDate))
                : undefined,
            }
          : undefined,
      ...this.visibleAlertWhere(member.familyRole),
    };
    this.assertQueryPeriod(query.fromDate, query.toDate);
    const [alerts, total] = await this.prisma.$transaction([
      this.prisma.budgetAlert.findMany({
        where,
        include: this.budgetAlertInclude(),
        orderBy: { createdAt: 'desc' },
        skip: skipFor(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.budgetAlert.count({ where }),
    ]);
    return buildPaginated(alerts, total, query.page, query.limit);
  }

  async getBudgetAlert(familyId: string, memberId: string, alertId: string) {
    const member = await this.getMemberInFamilyOrThrow(familyId, memberId);
    const alert = await this.prisma.budgetAlert.findFirst({
      where: { id: alertId, familyId },
      include: this.budgetAlertInclude(),
    });
    if (!alert) {
      throw new NotFoundException(
        'Không tìm thấy cảnh báo tài chính trong gia đình này',
      );
    }
    this.assertCanViewAlert(member.familyRole, alert);
    return alert;
  }

  async recomputeBudgetGoalAlerts(
    familyId: string,
    memberId: string,
    dto: RecomputeBudgetAlertsDto,
  ) {
    const pendingNotificationIds: string[] = [];
    const result = await this.prisma.$transaction(
      async (tx) => {
        const member = await this.getMemberInFamilyOrThrow(
          familyId,
          memberId,
          tx,
        );
        this.assertCanManageAlerts(member.familyRole);
        const period = await this.resolveAlertPeriod(tx, familyId, dto);
        const candidates: AlertCandidate[] = [];
        if (dto.scope === 'ALL' || dto.scope === 'BUDGET') {
          candidates.push(
            ...(await this.buildBudgetAlertCandidates(
              tx,
              familyId,
              dto.budgetPlanId,
            )),
          );
        }
        if (dto.scope === 'ALL' || dto.scope === 'GOAL') {
          candidates.push(
            ...(await this.buildGoalRiskAlertCandidates(
              tx,
              familyId,
              dto.goalId,
            )),
          );
        }
        if (dto.scope === 'ALL' || dto.scope === 'NON_ESSENTIAL') {
          candidates.push(
            ...(await this.buildNonEssentialAlertCandidates(
              tx,
              familyId,
              period.start,
              period.end,
              dto.budgetPlanId,
            )),
          );
        }
        return this.syncAlertCandidates(
          tx,
          familyId,
          candidates,
          {
            ...dto,
            periodStart: this.dateKey(period.start),
            periodEnd: this.dateKey(period.end),
          },
          pendingNotificationIds,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await this.notificationsService.dispatch(pendingNotificationIds);
    return result;
  }

  acknowledgeBudgetAlert(familyId: string, memberId: string, alertId: string) {
    return this.prisma.$transaction(async (tx) => {
      const member = await this.getMemberInFamilyOrThrow(
        familyId,
        memberId,
        tx,
      );
      this.assertCanManageAlerts(member.familyRole);
      const alert = await this.requireBudgetAlert(tx, familyId, alertId);
      if (alert.status === BudgetAlertStatus.RESOLVED) {
        throw new BadRequestException(
          'Không thể xác nhận cảnh báo đã được giải quyết',
        );
      }
      if (alert.status === BudgetAlertStatus.ACKNOWLEDGED) return alert;
      return tx.budgetAlert.update({
        where: { id: alert.id },
        data: { status: BudgetAlertStatus.ACKNOWLEDGED },
      });
    });
  }

  resolveBudgetAlert(
    familyId: string,
    memberId: string,
    alertId: string,
    dto: ResolveBudgetAlertDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const member = await this.getMemberInFamilyOrThrow(
        familyId,
        memberId,
        tx,
      );
      this.assertCanManageAlerts(member.familyRole);
      const alert = await this.requireBudgetAlert(tx, familyId, alertId);
      if (alert.status === BudgetAlertStatus.RESOLVED) {
        throw new ConflictException('Cảnh báo tài chính đã được giải quyết');
      }
      return tx.budgetAlert.update({
        where: { id: alert.id },
        data: {
          status: BudgetAlertStatus.RESOLVED,
          resolvedAt: new Date(),
          resolutionNote: dto.note?.trim(),
        },
      });
    });
  }

  private async getMemberInFamilyOrThrow(
    familyId: string,
    memberId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const member = await client.familyMember.findFirst({
      where: { id: memberId, familyId, status: MemberStatus.ACTIVE },
    });
    if (!member) {
      throw new NotFoundException(
        'Không tìm thấy thành viên đang hoạt động trong gia đình này',
      );
    }
    return member;
  }

  private isFinanceManager(familyRole: FamilyRole) {
    return (
      familyRole === FamilyRole.FAMILY_MANAGER ||
      familyRole === FamilyRole.DEPUTY_MEMBER
    );
  }

  private assertCanManageAlerts(familyRole: FamilyRole) {
    if (!this.isFinanceManager(familyRole)) {
      throw new ForbiddenException(
        'Không có quyền quản lý cảnh báo tài chính gia đình',
      );
    }
  }

  private assertCanViewAlert(
    familyRole: FamilyRole,
    alert: {
      jarId: string | null;
      goal?: { relatedJarId: string | null } | null;
    },
  ) {
    if (
      !this.isFinanceManager(familyRole) &&
      (alert.jarId || alert.goal?.relatedJarId)
    ) {
      throw new ForbiddenException(
        'Không có quyền xem cảnh báo tài chính gắn với hũ riêng',
      );
    }
  }

  private visibleAlertWhere(
    familyRole: FamilyRole,
  ): Prisma.BudgetAlertWhereInput {
    return this.isFinanceManager(familyRole)
      ? {}
      : {
          jarId: null,
          OR: [{ goalId: null }, { goal: { relatedJarId: null } }],
        };
  }

  private budgetAlertInclude() {
    return {
      budgetPlan: { select: { id: true, planName: true } },
      goal: { select: { id: true, goalName: true, relatedJarId: true } },
      jar: { select: { id: true, name: true, jarCode: true } },
      category: { select: { id: true, name: true, categoryType: true } },
    } as const;
  }

  private async requireBudgetAlert(
    tx: Prisma.TransactionClient,
    familyId: string,
    alertId: string,
  ) {
    const alert = await tx.budgetAlert.findFirst({
      where: { id: alertId, familyId },
    });
    if (!alert) {
      throw new NotFoundException(
        'Không tìm thấy cảnh báo tài chính trong gia đình này',
      );
    }
    return alert;
  }

  private assertQueryPeriod(start?: string, end?: string) {
    if (start && end) {
      this.assertValidBudgetPeriod(
        this.toDateOnly(start),
        this.toDateOnly(end),
      );
    }
  }

  private calculateAlertSeverity(
    thresholdValue: Prisma.Decimal,
    actualValue: Prisma.Decimal,
  ) {
    if (thresholdValue.equals(0) && actualValue.greaterThan(0)) {
      return BudgetAlertSeverity.HIGH;
    }
    const percent = actualValue
      .minus(thresholdValue)
      .dividedBy(thresholdValue)
      .times(100);
    if (percent.lessThanOrEqualTo(10)) return BudgetAlertSeverity.LOW;
    if (percent.lessThanOrEqualTo(25)) return BudgetAlertSeverity.MEDIUM;
    return BudgetAlertSeverity.HIGH;
  }

  private riskSeverityToAlertSeverity(severity: 'LOW' | 'MEDIUM' | 'HIGH') {
    return BudgetAlertSeverity[severity];
  }

  private thresholdForBudgetLine(line: {
    plannedAmount: Prisma.Decimal;
    thresholdAmount: Prisma.Decimal | null;
    thresholdPercent: Prisma.Decimal | null;
  }) {
    if (line.thresholdAmount) return line.thresholdAmount;
    if (line.thresholdPercent) {
      return line.plannedAmount.times(
        new Prisma.Decimal(1).plus(line.thresholdPercent.dividedBy(100)),
      );
    }
    return line.plannedAmount;
  }

  private async resolveAlertPeriod(
    tx: Prisma.TransactionClient,
    familyId: string,
    dto: RecomputeBudgetAlertsDto,
  ) {
    this.assertQueryPeriod(dto.periodStart, dto.periodEnd);
    if (
      (dto.periodStart && !dto.periodEnd) ||
      (!dto.periodStart && dto.periodEnd)
    ) {
      throw new BadRequestException(
        'periodStart và periodEnd phải được truyền cùng nhau',
      );
    }
    if (dto.periodStart && dto.periodEnd) {
      return {
        start: this.toDateOnly(dto.periodStart),
        end: this.toDateOnly(dto.periodEnd),
      };
    }
    if (dto.budgetPlanId) {
      const plan = await this.requireBudgetPlan(tx, familyId, dto.budgetPlanId);
      return { start: plan.periodStart, end: plan.periodEnd };
    }
    const now = new Date();
    return {
      start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)),
    };
  }

  private async buildBudgetAlertCandidates(
    tx: Prisma.TransactionClient,
    familyId: string,
    budgetPlanId?: string,
  ) {
    if (budgetPlanId) {
      await this.requireBudgetPlan(tx, familyId, budgetPlanId);
    }
    const plans = await tx.budgetPlan.findMany({
      where: {
        familyId,
        id: budgetPlanId,
        status: budgetPlanId ? undefined : BudgetPlanStatus.ACTIVE,
      },
      include: {
        lines: { include: { category: true, jar: true } },
      },
    });
    const ledger = await tx.financeLedger.findUnique({
      where: { familyId },
      select: { id: true },
    });
    const candidates: AlertCandidate[] = [];
    for (const plan of plans) {
      const entries = ledger
        ? await tx.ledgerEntry.findMany({
            where: {
              ledgerId: ledger.id,
              status: LedgerEntryStatus.ACTIVE,
              entryType: {
                in: [LedgerEntryType.EXPENSE, LedgerEntryType.SUPPORT],
              },
              entryDate: {
                gte: plan.periodStart,
                lt: this.nextUtcDay(plan.periodEnd),
              },
            },
            select: {
              categoryId: true,
              jarId: true,
              entryType: true,
              amount: true,
            },
          })
        : [];
      for (const line of plan.lines) {
        if (
          (line.categoryId &&
            line.category?.categoryType !== FinanceCategoryType.EXPENSE) ||
          (!line.categoryId && !line.jarId)
        ) {
          continue;
        }
        const actual = this.sumEntryAmounts(
          entries,
          [LedgerEntryType.EXPENSE, LedgerEntryType.SUPPORT],
          line.categoryId ?? undefined,
          line.jarId ?? undefined,
        );
        const threshold = this.thresholdForBudgetLine(line);
        if (actual.greaterThan(threshold)) {
          const percent = actual
            .minus(threshold)
            .dividedBy(threshold.equals(0) ? new Prisma.Decimal(1) : threshold)
            .times(100)
            .toDecimalPlaces(0);
          candidates.push({
            sourceKey: `OVER_BUDGET:${plan.id}:${line.id}`,
            alertType: BudgetAlertType.OVER_BUDGET,
            severity: this.calculateAlertSeverity(threshold, actual),
            budgetPlanId: plan.id,
            jarId: line.jarId ?? undefined,
            categoryId: line.categoryId ?? undefined,
            thresholdValue: threshold,
            actualValue: actual,
            message: `Chi tieu ${line.category?.name ?? line.jar?.name ?? line.id} da vuot ngan sach ${percent.toString()}% trong ky nay.`,
          });
        }
      }
    }
    return candidates;
  }

  private async buildGoalRiskAlertCandidates(
    tx: Prisma.TransactionClient,
    familyId: string,
    goalId?: string,
  ) {
    if (goalId) {
      await this.requireFinancialGoal(familyId, goalId, tx);
    }
    const goals = await tx.financialGoal.findMany({
      where: {
        familyId,
        id: goalId,
        status: {
          in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.AT_RISK],
        },
      },
      include: { relatedJar: true },
    });
    const candidates: AlertCandidate[] = [];
    for (const goal of goals) {
      const current = await this.calculateGoalAllocatedAmount(tx, goal.id);
      const progress = this.buildGoalProgress(goal, current);
      const status = this.computedGoalStatus(goal.status, progress);
      if (status !== goal.status) {
        await tx.financialGoal.update({
          where: { id: goal.id },
          data: { status },
        });
      }
      if (progress.isAtRisk && progress.riskSeverity) {
        candidates.push({
          sourceKey: `GOAL_AT_RISK:${goal.id}`,
          alertType: BudgetAlertType.GOAL_AT_RISK,
          severity: this.riskSeverityToAlertSeverity(progress.riskSeverity),
          goalId: goal.id,
          jarId: goal.relatedJarId ?? undefined,
          thresholdValue: goal.targetAmount,
          actualValue:
            progress.projectedAmountByDeadline ?? progress.currentAmount,
          message: `Mục tiêu ${goal.goalName} có nguy cơ không đạt đúng hạn.`,
        });
      }
    }
    return candidates;
  }

  private async buildNonEssentialAlertCandidates(
    tx: Prisma.TransactionClient,
    familyId: string,
    periodStart: Date,
    periodEnd: Date,
    budgetPlanId?: string,
  ) {
    if (budgetPlanId) {
      await this.requireBudgetPlan(tx, familyId, budgetPlanId);
    }
    const plan = await tx.budgetPlan.findFirst({
      where: {
        familyId,
        id: budgetPlanId,
        status: budgetPlanId ? undefined : BudgetPlanStatus.ACTIVE,
      },
      include: { lines: { include: { category: true, jar: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!plan) return [];
    const ledger = await tx.financeLedger.findUnique({
      where: { familyId },
      select: { id: true },
    });
    const result = ledger
      ? await tx.ledgerEntry.aggregate({
          where: {
            ledgerId: ledger.id,
            status: LedgerEntryStatus.ACTIVE,
            entryType: {
              in: [LedgerEntryType.EXPENSE, LedgerEntryType.SUPPORT],
            },
            entryDate: { gte: periodStart, lt: this.nextUtcDay(periodEnd) },
            category: { essentialType: EssentialType.NON_ESSENTIAL },
          },
          _sum: { amount: true },
        })
      : null;
    const actual = result?._sum.amount ?? new Prisma.Decimal(0);
    return this.nonEssentialThresholds(plan)
      .filter((item) => actual.greaterThan(item.thresholdLimit))
      .map<AlertCandidate>((item) => ({
        sourceKey: `NON_ESSENTIAL_TOO_HIGH:${this.dateKey(periodStart)}:${this.dateKey(periodEnd)}:${plan.id}:${item.lineId}`,
        alertType: BudgetAlertType.NON_ESSENTIAL_TOO_HIGH,
        severity: this.calculateAlertSeverity(item.thresholdLimit, actual),
        budgetPlanId: plan.id,
        categoryId: item.categoryId ?? undefined,
        thresholdValue: item.thresholdLimit,
        actualValue: actual,
        message:
          'Chi tiêu không thiết yếu đã vượt ngưỡng cho phép trong kỳ này.',
      }));
  }

  private nonEssentialThresholds(plan: {
    lines: Array<{
      id: string;
      categoryId: string | null;
      jarId: string | null;
      essentialType: EssentialType | null;
      plannedAmount: Prisma.Decimal;
      thresholdAmount: Prisma.Decimal | null;
      thresholdPercent: Prisma.Decimal | null;
      category: { essentialType: EssentialType } | null;
    }>;
  }) {
    return plan.lines
      .filter(
        (line) =>
          !line.jarId &&
          (line.essentialType ?? line.category?.essentialType) ===
            EssentialType.NON_ESSENTIAL,
      )
      .map((line) => ({
        lineId: line.id,
        categoryId: line.categoryId,
        thresholdLimit: this.thresholdForBudgetLine(line),
      }));
  }

  private async findAlertRecipientIds(
    tx: Prisma.TransactionClient,
    familyId: string,
  ) {
    const recipients = await tx.familyMember.findMany({
      where: {
        familyId,
        status: MemberStatus.ACTIVE,
        familyRole: {
          in: [FamilyRole.FAMILY_MANAGER, FamilyRole.DEPUTY_MEMBER],
        },
      },
      select: { id: true },
    });
    return recipients.map((member) => member.id);
  }

  private async syncAlertCandidates(
    tx: Prisma.TransactionClient,
    familyId: string,
    candidates: AlertCandidate[],
    dto: RecomputeBudgetAlertsDto,
    pendingNotificationIds: string[] = [],
  ) {
    const activeKeys = candidates.map((candidate) => candidate.sourceKey);
    let alertRecipientIds: string[] | null = null;
    for (const candidate of candidates) {
      const existing = await tx.budgetAlert.findFirst({
        where: {
          familyId,
          sourceKey: candidate.sourceKey,
          status: {
            in: [BudgetAlertStatus.NEW, BudgetAlertStatus.ACKNOWLEDGED],
          },
        },
      });
      const data = {
        severity: candidate.severity,
        thresholdValue: candidate.thresholdValue,
        actualValue: candidate.actualValue,
        message: candidate.message,
        budgetPlanId: candidate.budgetPlanId,
        goalId: candidate.goalId,
        jarId: candidate.jarId,
        categoryId: candidate.categoryId,
      };
      if (existing) {
        await tx.budgetAlert.update({ where: { id: existing.id }, data });
      } else {
        let alert: { id: string } | null = null;
        try {
          alert = await tx.budgetAlert.create({
            data: {
              familyId,
              sourceKey: candidate.sourceKey,
              alertType: candidate.alertType,
              ...data,
            },
          });
        } catch (error) {
          if (!this.isUniqueConstraintError(error)) {
            throw error;
          }
          const raced = await tx.budgetAlert.findFirst({
            where: {
              familyId,
              sourceKey: candidate.sourceKey,
              status: {
                in: [BudgetAlertStatus.NEW, BudgetAlertStatus.ACKNOWLEDGED],
              },
            },
          });
          if (!raced) {
            throw error;
          }
          await tx.budgetAlert.update({ where: { id: raced.id }, data });
        }
        if (alert) {
          alertRecipientIds ??= await this.findAlertRecipientIds(tx, familyId);
          const { ids } = await this.notificationsService.notify(
            familyId,
            alertRecipientIds,
            {
              type: NotificationType.FINANCE,
              priority: NotificationPriority.HIGH,
              title: 'Cảnh báo ngân sách',
              body: candidate.message,
              referenceType: 'BUDGET_ALERT',
              referenceId: alert.id,
            },
            { tx },
          );
          pendingNotificationIds.push(...ids);
        }
      }
    }
    const nonEssentialPrefix =
      dto.periodStart && dto.periodEnd
        ? `NON_ESSENTIAL_TOO_HIGH:${dto.periodStart}:${dto.periodEnd}:`
        : undefined;
    const staleBranches: Prisma.BudgetAlertWhereInput[] = [];
    if (dto.scope === 'ALL' || dto.scope === 'BUDGET') {
      staleBranches.push({
        alertType: BudgetAlertType.OVER_BUDGET,
        budgetPlanId: dto.budgetPlanId,
      });
    }
    if (dto.scope === 'ALL' || dto.scope === 'GOAL') {
      staleBranches.push({
        alertType: BudgetAlertType.GOAL_AT_RISK,
        goalId: dto.goalId,
      });
    }
    if (dto.scope === 'ALL' || dto.scope === 'NON_ESSENTIAL') {
      staleBranches.push({
        alertType: BudgetAlertType.NON_ESSENTIAL_TOO_HIGH,
        budgetPlanId: dto.budgetPlanId,
        sourceKey: nonEssentialPrefix
          ? { startsWith: nonEssentialPrefix }
          : undefined,
      });
    }
    const staleWhere: Prisma.BudgetAlertWhereInput = {
      familyId,
      status: { in: [BudgetAlertStatus.NEW, BudgetAlertStatus.ACKNOWLEDGED] },
      sourceKey: activeKeys.length ? { notIn: activeKeys } : undefined,
      OR: staleBranches,
    };
    const resolved = await tx.budgetAlert.updateMany({
      where: staleWhere,
      data: { status: BudgetAlertStatus.RESOLVED, resolvedAt: new Date() },
    });
    return { candidates: candidates.length, resolved: resolved.count };
  }

  private async requireBudgetPlan(
    tx: Prisma.TransactionClient,
    familyId: string,
    budgetPlanId: string,
  ) {
    const plan = await tx.budgetPlan.findFirst({
      where: { id: budgetPlanId, familyId },
    });
    if (!plan) {
      throw new NotFoundException(
        'Không tìm thấy kế hoạch ngân sách trong gia đình này',
      );
    }
    return plan;
  }

  private async requireFinancialGoal(
    familyId: string,
    goalId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const goal = await client.financialGoal.findFirst({
      where: { id: goalId, familyId },
      include: { relatedJar: true },
    });
    if (!goal) {
      throw new NotFoundException(
        'Không tìm thấy mục tiêu tài chính trong gia đình này',
      );
    }
    return goal;
  }

  private async calculateGoalAllocatedAmount(
    client: Prisma.TransactionClient | PrismaService,
    goalId: string,
  ) {
    const result = await client.goalAllocation.aggregate({
      where: { goalId },
      _sum: { amount: true },
    });
    return result._sum.amount ?? new Prisma.Decimal(0);
  }

  private buildGoalProgress(
    goal: FinancialGoalWithJar,
    currentAmount: Prisma.Decimal,
  ) {
    const zero = new Prisma.Decimal(0);
    const remainingAmount = Prisma.Decimal.max(
      goal.targetAmount.minus(currentAmount),
      zero,
    );
    const progressPercent = Prisma.Decimal.min(
      currentAmount.dividedBy(goal.targetAmount).times(100),
      new Prisma.Decimal(100),
    );
    let daysRemaining: number | null = null;
    let monthsRemaining: number | null = null;
    let recommendedMonthlyContribution: Prisma.Decimal | null = null;
    let projectedAmountByDeadline: Prisma.Decimal | null = null;
    let isAtRisk = false;
    let riskSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | null = null;

    if (goal.deadline) {
      const today = this.toDateOnly(new Date().toISOString());
      daysRemaining = Math.ceil(
        (goal.deadline.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
      );
      monthsRemaining =
        daysRemaining > 0 ? Math.max(Math.ceil(daysRemaining / 30), 1) : 0;
      recommendedMonthlyContribution =
        monthsRemaining > 0
          ? remainingAmount.dividedBy(monthsRemaining)
          : remainingAmount;
      if (currentAmount.lessThan(goal.targetAmount) && daysRemaining <= 0) {
        isAtRisk = true;
        riskSeverity = 'HIGH';
      } else if (goal.monthlyContributionTarget && monthsRemaining > 0) {
        projectedAmountByDeadline = currentAmount.plus(
          goal.monthlyContributionTarget.times(monthsRemaining),
        );
        if (projectedAmountByDeadline.lessThan(goal.targetAmount)) {
          isAtRisk = true;
          const shortagePercent = goal.targetAmount
            .minus(projectedAmountByDeadline)
            .dividedBy(goal.targetAmount)
            .times(100);
          riskSeverity = shortagePercent.lessThanOrEqualTo(10)
            ? 'LOW'
            : shortagePercent.lessThanOrEqualTo(25)
              ? 'MEDIUM'
              : 'HIGH';
        }
      }
    }

    const isAchieved = currentAmount.greaterThanOrEqualTo(goal.targetAmount);
    if (isAchieved) {
      isAtRisk = false;
      riskSeverity = null;
    }
    return {
      currentAmount,
      targetAmount: goal.targetAmount,
      remainingAmount,
      progressPercent,
      daysRemaining,
      monthsRemaining,
      monthlyContributionTarget: goal.monthlyContributionTarget,
      recommendedMonthlyContribution,
      projectedAmountByDeadline,
      isAchieved,
      isAtRisk,
      riskSeverity,
    };
  }

  private computedGoalStatus(
    currentStatus: FinancialGoalStatus,
    progress: { isAchieved: boolean; isAtRisk: boolean },
  ) {
    if (currentStatus === FinancialGoalStatus.CANCELED) {
      return FinancialGoalStatus.CANCELED;
    }
    if (progress.isAchieved) return FinancialGoalStatus.ACHIEVED;
    if (progress.isAtRisk) return FinancialGoalStatus.AT_RISK;
    return FinancialGoalStatus.ACTIVE;
  }

  private assertValidBudgetPeriod(periodStart: Date, periodEnd: Date) {
    if (periodEnd.getTime() < periodStart.getTime()) {
      throw new BadRequestException(
        'Ngày kết thúc kỳ ngân sách phải lớn hơn hoặc bằng ngày bắt đầu',
      );
    }
  }

  private toDateOnly(value: string) {
    const date = new Date(value);
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private nextUtcDay(date: Date) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + 1,
      ),
    );
  }

  private dateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private sumEntryAmounts(
    entries: Array<{
      categoryId: string | null;
      jarId?: string | null;
      entryType: LedgerEntryType;
      amount: Prisma.Decimal;
    }>,
    types: readonly LedgerEntryType[],
    categoryId?: string,
    jarId?: string,
  ) {
    return entries.reduce((sum, entry) => {
      if (!types.includes(entry.entryType)) return sum;
      if (categoryId && entry.categoryId !== categoryId) return sum;
      if (jarId && entry.jarId !== jarId) return sum;
      return sum.plus(entry.amount);
    }, new Prisma.Decimal(0));
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
