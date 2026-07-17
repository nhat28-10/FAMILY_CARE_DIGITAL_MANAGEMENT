import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BudgetAlertSeverity,
  BudgetAlertStatus,
  BudgetPlanStatus,
  EssentialType,
  FamilyRole,
  FinanceCategoryType,
  FinancialGoalStatus,
  LedgerEntryStatus,
  LedgerEntryType,
  MemberStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { FinanceReportQueryDto } from '../dto/finance-report-query.dto';

type FinancialGoalWithJar = Prisma.FinancialGoalGetPayload<{
  include: { relatedJar: true };
}>;

@Injectable()
export class FinanceReportService {
  constructor(private readonly prisma: PrismaService) {}
  async getBudgetPlan(familyId: string, budgetPlanId: string) {
    const plan = await this.prisma.budgetPlan.findFirst({
      where: { id: budgetPlanId, familyId },
      include: {
        createdByMember: {
          select: {
            id: true,
            displayName: true,
            user: { select: { id: true, fullName: true, avatarUrl: true } },
          },
        },
        lines: {
          include: { category: true, jar: true },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!plan) {
      throw new NotFoundException(
        'Không tìm thấy kế hoạch ngân sách trong gia đình này',
      );
    }
    return plan;
  }

  async getBudgetPlanReport(familyId: string, budgetPlanId: string) {
    const budgetPlan = await this.getBudgetPlan(familyId, budgetPlanId);
    const ledger = await this.prisma.financeLedger.findUnique({
      where: { familyId },
      select: { id: true },
    });
    const entries = ledger
      ? await this.prisma.ledgerEntry.findMany({
          where: {
            ledgerId: ledger.id,
            status: LedgerEntryStatus.ACTIVE,
            entryDate: {
              gte: budgetPlan.periodStart,
              lt: this.nextUtcDay(budgetPlan.periodEnd),
            },
            entryType: {
              in: [
                LedgerEntryType.INCOME,
                LedgerEntryType.CONTRIBUTION,
                LedgerEntryType.EXPENSE,
                LedgerEntryType.SUPPORT,
              ],
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

    const zero = new Prisma.Decimal(0);
    const incomeTypes: LedgerEntryType[] = [
      LedgerEntryType.INCOME,
      LedgerEntryType.CONTRIBUTION,
    ];
    const expenseTypes: LedgerEntryType[] = [
      LedgerEntryType.EXPENSE,
      LedgerEntryType.SUPPORT,
    ];
    const actualIncome = this.sumEntryAmounts(entries, incomeTypes);
    const actualExpense = this.sumEntryAmounts(entries, expenseTypes);

    const plannedIncomeFallback = budgetPlan.lines.reduce(
      (sum, line) =>
        line.category?.categoryType === FinanceCategoryType.INCOME
          ? sum.plus(line.plannedAmount)
          : sum,
      zero,
    );
    const plannedExpenseFallback = budgetPlan.lines.reduce(
      (sum, line) =>
        !line.category ||
        line.category.categoryType === FinanceCategoryType.EXPENSE
          ? sum.plus(line.plannedAmount)
          : sum,
      zero,
    );
    const plannedIncome =
      budgetPlan.expectedSharedIncome ?? plannedIncomeFallback;
    const plannedExpense =
      budgetPlan.expectedSharedExpense ?? plannedExpenseFallback;
    const warnings: Array<{
      type: 'OVER_BUDGET' | 'SHORTAGE_RISK';
      severity: 'LOW' | 'MEDIUM' | 'HIGH';
      message: string;
      budgetLineId?: string;
    }> = [];

    const lines = budgetPlan.lines.map((budgetLine) => {
      const entryTypes =
        budgetLine.category?.categoryType === FinanceCategoryType.INCOME
          ? incomeTypes
          : expenseTypes;
      const actualAmount = budgetLine.categoryId
        ? this.sumEntryAmounts(entries, entryTypes, budgetLine.categoryId)
        : budgetLine.jarId
          ? this.sumEntryAmounts(
              entries,
              entryTypes,
              undefined,
              budgetLine.jarId,
            )
          : zero;
      const thresholdLimit = budgetLine.thresholdAmount
        ? budgetLine.thresholdAmount
        : budgetLine.thresholdPercent
          ? budgetLine.plannedAmount.times(
              new Prisma.Decimal(1).plus(
                budgetLine.thresholdPercent.dividedBy(100),
              ),
            )
          : budgetLine.plannedAmount;
      const isOverBudget = actualAmount.greaterThan(thresholdLimit);
      if (isOverBudget) {
        warnings.push({
          type: 'OVER_BUDGET',
          severity: this.warningSeverity(actualAmount, thresholdLimit),
          message: `Dòng ngân sách ${budgetLine.id} đã vượt ngưỡng`,
          budgetLineId: budgetLine.id,
        });
      }
      return {
        budgetLine,
        actualAmount,
        varianceAmount: actualAmount.minus(budgetLine.plannedAmount),
        thresholdLimit,
        isOverBudget,
      };
    });

    const shortageLimits = [
      budgetPlan.expectedSharedIncome,
      budgetPlan.expectedSharedExpense,
    ].filter((value): value is Prisma.Decimal => value !== null);
    const exceededLimits = shortageLimits.filter((limit) =>
      actualExpense.greaterThan(limit),
    );
    if (exceededLimits.length > 0) {
      const severity = exceededLimits
        .map((limit) => this.warningSeverity(actualExpense, limit))
        .sort((a, b) => this.severityRank(b) - this.severityRank(a))[0];
      warnings.push({
        type: 'SHORTAGE_RISK',
        severity,
        message: 'Chi tiêu thực tế đang vượt mức ngân sách dự kiến',
      });
    }

    return {
      budgetPlan,
      totals: {
        plannedIncome,
        plannedExpense,
        actualIncome,
        actualExpense,
        plannedBalance: plannedIncome.minus(plannedExpense),
        actualBalance: actualIncome.minus(actualExpense),
        varianceExpense: actualExpense.minus(plannedExpense),
        varianceIncome: actualIncome.minus(plannedIncome),
      },
      lines,
      warnings,
    };
  }

  async getFinanceOverviewReport(
    familyId: string,
    memberId: string,
    query: FinanceReportQueryDto,
  ) {
    const member = await this.getMemberInFamilyOrThrow(familyId, memberId);
    const context = await this.resolveReportContext(familyId, query);
    const [budget, spending, goals, alerts] = await Promise.all([
      this.buildBudgetSummary(
        familyId,
        context.plan,
        context.start,
        context.end,
        member.familyRole,
      ),
      this.buildSpendingSummary(
        familyId,
        context.start,
        context.end,
        query.includeBreakdown,
      ),
      query.includeGoals
        ? this.buildGoalSummary(familyId, member.familyRole)
        : null,
      query.includeAlerts
        ? this.buildAlertSummary(familyId, member.familyRole)
        : null,
    ]);
    return {
      period: { periodStart: context.start, periodEnd: context.end },
      budget,
      goals,
      spending: {
        ...spending,
        byJar: [],
      },
      alerts,
    };
  }

  async getBudgetGoalReport(
    familyId: string,
    memberId: string,
    query: FinanceReportQueryDto,
  ) {
    const member = await this.getMemberInFamilyOrThrow(familyId, memberId);
    const context = await this.resolveReportContext(familyId, query);
    const rawBudgetPlanReport = context.plan
      ? await this.buildBudgetPlanReportData(familyId, context.plan)
      : null;
    const budgetPlanReport = this.isFinanceManager(member.familyRole)
      ? rawBudgetPlanReport
      : this.redactJarBudgetReport(rawBudgetPlanReport);
    const goals = await this.prisma.financialGoal.findMany({
      where: {
        familyId,
        relatedJar: this.isFinanceManager(member.familyRole)
          ? undefined
          : { is: null },
      },
      include: { relatedJar: true },
      orderBy: { createdAt: 'desc' },
    });
    const goalProgressReport = query.includeGoals
      ? await Promise.all(goals.map((goal) => this.goalWithProgress(goal)))
      : [];
    const alerts = query.includeAlerts
      ? await this.prisma.budgetAlert.findMany({
          where: {
            familyId,
            status: { not: BudgetAlertStatus.RESOLVED },
            ...this.visibleAlertWhere(member.familyRole),
          },
          include: this.budgetAlertInclude(),
          orderBy: { createdAt: 'desc' },
        })
      : [];
    return { budgetPlanReport, goalProgressReport, alerts };
  }

  async getNonEssentialSpendingReport(
    familyId: string,
    memberId: string,
    query: FinanceReportQueryDto,
  ) {
    await this.getMemberInFamilyOrThrow(familyId, memberId);
    const context = await this.resolveReportContext(familyId, query);
    const spending = await this.buildSpendingSummary(
      familyId,
      context.start,
      context.end,
      true,
    );
    const thresholds = context.plan
      ? this.nonEssentialThresholds(context.plan)
      : [];
    return {
      period: { periodStart: context.start, periodEnd: context.end },
      nonEssentialExpense: spending.nonEssentialExpense,
      totalExpense: spending.totalExpense,
      nonEssentialRatio: spending.nonEssentialRatio,
      byCategory: spending.byCategory.filter(
        (item) => item.essentialType === EssentialType.NON_ESSENTIAL,
      ),
      byJar: [],
      thresholds: thresholds.map((threshold) => ({
        ...threshold,
        actualAmount: spending.nonEssentialExpense,
        isOverThreshold: spending.nonEssentialExpense.greaterThan(
          threshold.thresholdLimit,
        ),
      })),
    };
  }

  private visibleFinancialGoalWhere(
    familyId: string,
    familyRole: FamilyRole,
  ): Prisma.FinancialGoalWhereInput {
    return {
      familyId,
      relatedJar: this.isFinanceManager(familyRole) ? undefined : { is: null },
    };
  }

  private isFinanceManager(familyRole: FamilyRole) {
    return (
      familyRole === FamilyRole.FAMILY_MANAGER ||
      familyRole === FamilyRole.DEPUTY_MEMBER
    );
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

  private assertQueryPeriod(start?: string, end?: string) {
    if (start && end) {
      this.assertValidBudgetPeriod(
        this.toDateOnly(start),
        this.toDateOnly(end),
      );
    }
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

  private async resolveReportContext(
    familyId: string,
    query: FinanceReportQueryDto,
  ) {
    this.assertQueryPeriod(query.periodStart, query.periodEnd);
    if (
      (query.periodStart && !query.periodEnd) ||
      (!query.periodStart && query.periodEnd)
    ) {
      throw new BadRequestException(
        'periodStart và periodEnd phải được truyền cùng nhau',
      );
    }
    if (query.budgetPlanId) {
      const plan = await this.prisma.budgetPlan.findFirst({
        where: { id: query.budgetPlanId, familyId },
        include: { lines: { include: { category: true, jar: true } } },
      });
      if (!plan) {
        throw new NotFoundException(
          'Không tìm thấy kế hoạch ngân sách trong gia đình này',
        );
      }
      return { start: plan.periodStart, end: plan.periodEnd, plan };
    }
    const now = new Date();
    const start = query.periodStart
      ? this.toDateOnly(query.periodStart)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = query.periodEnd
      ? this.toDateOnly(query.periodEnd)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const plan = await this.prisma.budgetPlan.findFirst({
      where: {
        familyId,
        status: BudgetPlanStatus.ACTIVE,
        periodStart: { lte: start },
        periodEnd: { gte: end },
      },
      include: { lines: { include: { category: true, jar: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { start, end, plan };
  }

  private async buildBudgetSummary(
    familyId: string,
    plan: Prisma.BudgetPlanGetPayload<{
      include: { lines: { include: { category: true; jar: true } } };
    }> | null,
    start: Date,
    end: Date,
    familyRole: FamilyRole,
  ) {
    const ledger = await this.prisma.financeLedger.findUnique({
      where: { familyId },
      select: { id: true },
    });
    const entries = ledger
      ? await this.prisma.ledgerEntry.findMany({
          where: {
            ledgerId: ledger.id,
            status: LedgerEntryStatus.ACTIVE,
            entryDate: { gte: start, lt: this.nextUtcDay(end) },
            entryType: {
              in: [
                LedgerEntryType.INCOME,
                LedgerEntryType.CONTRIBUTION,
                LedgerEntryType.EXPENSE,
                LedgerEntryType.SUPPORT,
              ],
            },
          },
          select: { categoryId: true, entryType: true, amount: true },
        })
      : [];
    const zero = new Prisma.Decimal(0);
    const plannedIncomeFallback =
      plan?.lines.reduce(
        (sum, line) =>
          line.category?.categoryType === FinanceCategoryType.INCOME
            ? sum.plus(line.plannedAmount)
            : sum,
        zero,
      ) ?? zero;
    const plannedExpenseFallback =
      plan?.lines.reduce(
        (sum, line) =>
          !line.category ||
          line.category.categoryType === FinanceCategoryType.EXPENSE
            ? sum.plus(line.plannedAmount)
            : sum,
        zero,
      ) ?? zero;
    const plannedIncome = plan?.expectedSharedIncome ?? plannedIncomeFallback;
    const plannedExpense =
      plan?.expectedSharedExpense ?? plannedExpenseFallback;
    const actualIncome = this.sumEntryAmounts(entries, [
      LedgerEntryType.INCOME,
      LedgerEntryType.CONTRIBUTION,
    ]);
    const actualExpense = this.sumEntryAmounts(entries, [
      LedgerEntryType.EXPENSE,
      LedgerEntryType.SUPPORT,
    ]);
    const overBudgetLineCount = plan
      ? plan.lines.filter((line) => {
          if (
            !line.categoryId ||
            line.category?.categoryType !== FinanceCategoryType.EXPENSE
          ) {
            return false;
          }
          const actual = this.sumEntryAmounts(
            entries,
            [LedgerEntryType.EXPENSE, LedgerEntryType.SUPPORT],
            line.categoryId,
          );
          return actual.greaterThan(this.thresholdForBudgetLine(line));
        }).length
      : 0;
    return {
      activeBudgetPlan: this.isFinanceManager(familyRole)
        ? plan
        : plan
          ? { ...plan, lines: plan.lines.filter((line) => !line.jarId) }
          : null,
      plannedIncome,
      plannedExpense,
      actualIncome,
      actualExpense,
      plannedBalance: plannedIncome.minus(plannedExpense),
      actualBalance: actualIncome.minus(actualExpense),
      incomeVariance: actualIncome.minus(plannedIncome),
      expenseVariance: actualExpense.minus(plannedExpense),
      overBudgetLineCount,
    };
  }

  private async buildSpendingSummary(
    familyId: string,
    start: Date,
    end: Date,
    includeBreakdown: boolean,
  ) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        ledger: { familyId },
        status: LedgerEntryStatus.ACTIVE,
        entryType: { in: [LedgerEntryType.EXPENSE, LedgerEntryType.SUPPORT] },
        entryDate: { gte: start, lt: this.nextUtcDay(end) },
      },
      include: { category: true },
    });
    const zero = new Prisma.Decimal(0);
    const essentialExpense = entries.reduce(
      (sum, entry) =>
        entry.category?.essentialType === EssentialType.ESSENTIAL
          ? sum.plus(entry.amount)
          : sum,
      zero,
    );
    const nonEssentialExpense = entries.reduce(
      (sum, entry) =>
        entry.category?.essentialType === EssentialType.NON_ESSENTIAL
          ? sum.plus(entry.amount)
          : sum,
      zero,
    );
    const totalExpense = entries.reduce(
      (sum, entry) => sum.plus(entry.amount),
      zero,
    );
    const categoryMap = new Map<
      string,
      {
        categoryId: string | null;
        name: string;
        essentialType: EssentialType;
        amount: Prisma.Decimal;
      }
    >();
    if (includeBreakdown) {
      for (const entry of entries) {
        const key = entry.categoryId ?? 'UNCATEGORIZED';
        const current = categoryMap.get(key);
        categoryMap.set(key, {
          categoryId: entry.categoryId,
          name: entry.category?.name ?? 'Chưa phân loại',
          essentialType: entry.category?.essentialType ?? EssentialType.NEUTRAL,
          amount: (current?.amount ?? zero).plus(entry.amount),
        });
      }
    }
    return {
      totalExpense,
      essentialExpense,
      nonEssentialExpense,
      nonEssentialRatio: totalExpense.equals(0)
        ? zero
        : nonEssentialExpense.dividedBy(totalExpense).times(100),
      byCategory: [...categoryMap.values()],
    };
  }

  private async buildGoalSummary(familyId: string, familyRole: FamilyRole) {
    const goals = await this.prisma.financialGoal.findMany({
      where: {
        familyId,
        relatedJar: this.isFinanceManager(familyRole)
          ? undefined
          : { is: null },
      },
      include: { relatedJar: true },
    });
    const items = await Promise.all(
      goals.map((goal) => this.goalWithProgress(goal)),
    );
    const zero = new Prisma.Decimal(0);
    const totalTargetAmount = goals.reduce(
      (sum, goal) => sum.plus(goal.targetAmount),
      zero,
    );
    const totalCurrentAmount = items.reduce(
      (sum, item) => sum.plus(item.progress.currentAmount),
      zero,
    );
    const averageProgressPercent = items.length
      ? items
          .reduce((sum, item) => sum.plus(item.progress.progressPercent), zero)
          .dividedBy(items.length)
      : zero;
    return {
      totalGoals: items.length,
      activeGoals: items.filter(
        (item) => item.goal.status === FinancialGoalStatus.ACTIVE,
      ).length,
      achievedGoals: items.filter(
        (item) => item.goal.status === FinancialGoalStatus.ACHIEVED,
      ).length,
      atRiskGoals: items.filter(
        (item) => item.goal.status === FinancialGoalStatus.AT_RISK,
      ).length,
      totalTargetAmount,
      totalCurrentAmount,
      averageProgressPercent,
      items,
    };
  }

  private async buildAlertSummary(familyId: string, familyRole: FamilyRole) {
    const where: Prisma.BudgetAlertWhereInput = {
      familyId,
      ...this.visibleAlertWhere(familyRole),
    };
    const [alerts, latest] = await Promise.all([
      this.prisma.budgetAlert.findMany({
        where,
        select: { status: true, severity: true },
      }),
      this.prisma.budgetAlert.findMany({
        where,
        include: this.budgetAlertInclude(),
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);
    return {
      totalNew: alerts.filter((a) => a.status === BudgetAlertStatus.NEW).length,
      totalAcknowledged: alerts.filter(
        (a) => a.status === BudgetAlertStatus.ACKNOWLEDGED,
      ).length,
      totalResolved: alerts.filter(
        (a) => a.status === BudgetAlertStatus.RESOLVED,
      ).length,
      highCount: alerts.filter((a) => a.severity === BudgetAlertSeverity.HIGH)
        .length,
      mediumCount: alerts.filter(
        (a) => a.severity === BudgetAlertSeverity.MEDIUM,
      ).length,
      lowCount: alerts.filter((a) => a.severity === BudgetAlertSeverity.LOW)
        .length,
      latest,
    };
  }

  private buildBudgetPlanReportData(
    familyId: string,
    plan: Prisma.BudgetPlanGetPayload<{
      include: { lines: { include: { category: true; jar: true } } };
    }>,
  ) {
    return this.getBudgetPlanReport(familyId, plan.id);
  }

  private redactJarBudgetReport<
    T extends {
      budgetPlan: { lines: Array<{ jarId: string | null }> };
      lines: Array<{ budgetLine: { jarId: string | null } }>;
      warnings: Array<{ budgetLineId?: string }>;
    } | null,
  >(report: T) {
    if (!report) return report;
    const hiddenLineIds = new Set(
      report.budgetPlan.lines
        .filter((line) => line.jarId)
        .map((line) => ('id' in line ? String(line.id) : '')),
    );
    return {
      ...report,
      budgetPlan: {
        ...report.budgetPlan,
        lines: report.budgetPlan.lines.filter((line) => !line.jarId),
      },
      lines: report.lines.filter((line) => !line.budgetLine.jarId),
      warnings: report.warnings.filter(
        (warning) =>
          !warning.budgetLineId || !hiddenLineIds.has(warning.budgetLineId),
      ),
    };
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

  private async assertJarBelongsToFamily(
    tx: Prisma.TransactionClient,
    familyId: string,
    relatedJarId: string,
  ) {
    const jar = await tx.financeJar.findFirst({
      where: { id: relatedJarId, financeModel: { familyId } },
      select: { id: true },
    });
    if (!jar) {
      throw new NotFoundException(
        'Không tìm thấy hũ tài chính trong gia đình này',
      );
    }
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

  private async goalWithProgress(goal: FinancialGoalWithJar) {
    const current = await this.calculateGoalAllocatedAmount(
      this.prisma,
      goal.id,
    );
    const progress = this.buildGoalProgress(goal, current);
    return {
      goal: { ...goal, status: this.computedGoalStatus(goal.status, progress) },
      progress,
    };
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

  private sumEntryAmounts(
    entries: Array<{
      categoryId: string | null;
      jarId?: string | null;
      entryType: LedgerEntryType;
      amount: Prisma.Decimal;
    }>,
    entryTypes: LedgerEntryType[],
    categoryId?: string,
    jarId?: string,
  ) {
    return entries.reduce(
      (sum, entry) =>
        entryTypes.includes(entry.entryType) &&
        (categoryId === undefined || entry.categoryId === categoryId) &&
        (jarId === undefined || entry.jarId === jarId)
          ? sum.plus(entry.amount)
          : sum,
      new Prisma.Decimal(0),
    );
  }

  private warningSeverity(actual: Prisma.Decimal, limit: Prisma.Decimal) {
    if (limit.equals(0)) return 'HIGH' as const;
    const ratio = actual.minus(limit).dividedBy(limit).times(100);
    if (ratio.lessThanOrEqualTo(10)) return 'LOW' as const;
    if (ratio.lessThanOrEqualTo(25)) return 'MEDIUM' as const;
    return 'HIGH' as const;
  }

  private severityRank(severity: 'LOW' | 'MEDIUM' | 'HIGH') {
    return { LOW: 1, MEDIUM: 2, HIGH: 3 }[severity];
  }
}
