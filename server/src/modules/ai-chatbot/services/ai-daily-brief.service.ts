import { Injectable } from '@nestjs/common';
import {
  AiRelatedModule,
  BudgetAlertSeverity,
  BudgetAlertStatus,
  BudgetAlertType,
  BudgetPlanStatus,
  CalendarEventStatus,
  FamilyRole,
  FinancialGoalStatus,
  GoalContributionPlanStatus,
  LedgerEntryStatus,
  LedgerEntryType,
  Prisma,
  TaskAssignmentStatus,
  TaskStatus,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';

type InsightSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
type BriefInsightType =
  | 'TASK_OVERDUE'
  | 'TASK_DUE_TODAY'
  | 'CALENDAR_UPCOMING'
  | 'BUDGET_USAGE'
  | 'BUDGET_ALERT'
  | 'GOAL_AT_RISK'
  | 'GOAL_CONTRIBUTION_MISSED';

type BriefInsight = {
  type: BriefInsightType;
  severity: InsightSeverity;
  relatedModule: AiRelatedModule;
  title: string;
  message: string;
  actionPrompt: string;
};

type BudgetAlertBrief = {
  id: string;
  alertType: BudgetAlertType;
  severity: BudgetAlertSeverity;
  message: string | null;
  createdAt: Date;
};

type MonthlyCashflowBrief = {
  totalIncome: number;
  totalExpense: number;
  balance: number;
};

type GoalBrief = {
  id: string;
  goalName: string;
  targetAmount: number;
  currentAmount: number;
  progressPercent: number;
  deadline: Date | null;
  monthlyContributionTarget: number | null;
  status: FinancialGoalStatus;
  isAtRisk: boolean;
};

type FinanceBrief = {
  month: { month: number; year: number };
  monthlyCashflow: MonthlyCashflowBrief | null;
  activeBudgetPlan: {
    id: string;
    planName: string;
    periodStart: Date;
    periodEnd: Date;
    expectedSharedExpense: number | null;
    lineCount: number;
    usagePercent: number | null;
  } | null;
  budgetAlerts: Array<BudgetAlertBrief & { severityRank: number }>;
  goals: GoalBrief[];
  atRiskGoalCount: number;
  missedContributionPlanCount: number;
};

const ACTIVE_ASSIGNMENT_STATUSES = [
  TaskAssignmentStatus.ASSIGNED,
  TaskAssignmentStatus.IN_PROGRESS,
  TaskAssignmentStatus.REJECTED,
];

const CASH_IN_ENTRY_TYPES = [
  LedgerEntryType.INCOME,
  LedgerEntryType.CONTRIBUTION,
] as const;

const CASH_OUT_ENTRY_TYPES = [
  LedgerEntryType.EXPENSE,
  LedgerEntryType.SUPPORT,
  LedgerEntryType.ALLOWANCE,
  LedgerEntryType.REWARD,
] as const;

const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

@Injectable()
export class AiDailyBriefService {
  constructor(private readonly prisma: PrismaService) {}

  async getDailyBrief(input: {
    familyId: string;
    memberId: string;
    familyRole: FamilyRole;
  }) {
    const now = new Date();
    const today = this.vietnamDayRange(now);
    const weekEnd = this.addDays(today.start, 7);
    const month = this.vietnamMonthRange(now);
    const isFinanceManager = this.isFinanceManager(input.familyRole);

    const familyPromise = this.prisma.family.findUnique({
      where: { id: input.familyId },
      select: { id: true, name: true },
    });
    const taskPromise = this.buildTaskBrief(
      input.familyId,
      input.memberId,
      now,
      today,
    );
    const calendarPromise = this.buildCalendarBrief(
      input.familyId,
      now,
      weekEnd,
    );
    const financePromise = this.buildFinanceBrief({
      familyId: input.familyId,
      memberId: input.memberId,
      familyRole: input.familyRole,
      isFinanceManager,
      now,
      month,
    });

    const [family, task, calendar, finance] = await Promise.all([
      familyPromise,
      taskPromise,
      calendarPromise,
      financePromise,
    ]);
    const insights = this.buildInsights(task, calendar, finance);

    return {
      generatedAt: now.toISOString(),
      family: {
        id: input.familyId,
        name: family?.name ?? 'Gia đình',
      },
      scope: {
        timezone: VIETNAM_TIME_ZONE,
        today: this.vietnamDateKey(now),
        month: month.month,
        year: month.year,
        financeScope: isFinanceManager ? 'FAMILY' : 'PERSONAL_LIMITED',
      },
      task,
      calendar,
      finance,
      insights,
      suggestedPrompts: this.suggestedPrompts(insights),
    };
  }

  private async buildTaskBrief(
    familyId: string,
    memberId: string,
    now: Date,
    today: { start: Date; end: Date },
  ) {
    const assignmentWhere = {
      assignedToMemberId: memberId,
      status: { in: ACTIVE_ASSIGNMENT_STATUSES },
      task: { familyId, status: TaskStatus.ACTIVE },
    };
    const [overdueCount, dueTodayCount, nextAssignments] =
      await this.prisma.$transaction([
        this.prisma.taskAssignment.count({
          where: {
            ...assignmentWhere,
            dueAt: { lt: now },
          },
        }),
        this.prisma.taskAssignment.count({
          where: {
            ...assignmentWhere,
            dueAt: { gte: today.start, lt: today.end },
          },
        }),
        this.prisma.taskAssignment.findMany({
          where: {
            ...assignmentWhere,
            dueAt: { gte: now },
          },
          select: {
            id: true,
            status: true,
            dueAt: true,
            task: {
              select: {
                id: true,
                title: true,
                priority: true,
              },
            },
          },
          orderBy: { dueAt: 'asc' },
          take: 3,
        }),
      ]);

    return {
      overdueCount,
      dueTodayCount,
      nextAssignments: nextAssignments.map((assignment) => ({
        id: assignment.id,
        status: assignment.status,
        dueAt: assignment.dueAt,
        task: assignment.task,
      })),
    };
  }

  private async buildCalendarBrief(familyId: string, now: Date, weekEnd: Date) {
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        workspaceId: familyId,
        status: CalendarEventStatus.ACTIVE,
        startTime: { gte: now, lt: weekEnd },
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        location: true,
      },
      orderBy: { startTime: 'asc' },
      take: 5,
    });
    return {
      upcomingCount: events.length,
      nextEvents: events,
    };
  }

  private async buildFinanceBrief(input: {
    familyId: string;
    memberId: string;
    familyRole: FamilyRole;
    isFinanceManager: boolean;
    now: Date;
    month: { start: Date; end: Date; month: number; year: number };
  }): Promise<FinanceBrief> {
    const ledger = await this.prisma.financeLedger.findUnique({
      where: { familyId: input.familyId },
      select: { id: true },
    });
    const budgetAlertsPromise: Promise<BudgetAlertBrief[]> =
      input.isFinanceManager
        ? this.prisma.budgetAlert.findMany({
            where: {
              familyId: input.familyId,
              status: {
                in: [BudgetAlertStatus.NEW, BudgetAlertStatus.ACKNOWLEDGED],
              },
            },
            select: {
              id: true,
              alertType: true,
              severity: true,
              message: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          })
        : Promise.resolve([]);
    const [
      monthlyCashflow,
      activeBudgetPlan,
      budgetAlerts,
      goals,
      missedPlans,
    ] = await Promise.all([
      ledger && input.isFinanceManager
        ? this.buildMonthlyCashflow(ledger.id, input.month)
        : Promise.resolve(null),
      input.isFinanceManager
        ? this.prisma.budgetPlan.findFirst({
            where: {
              familyId: input.familyId,
              status: BudgetPlanStatus.ACTIVE,
              periodStart: { lte: input.now },
              periodEnd: { gte: input.now },
            },
            select: {
              id: true,
              planName: true,
              periodStart: true,
              periodEnd: true,
              expectedSharedExpense: true,
              _count: { select: { lines: true } },
            },
            orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve(null),
      budgetAlertsPromise,
      this.prisma.financialGoal.findMany({
        where: {
          familyId: input.familyId,
          status: {
            in: [FinancialGoalStatus.ACTIVE, FinancialGoalStatus.AT_RISK],
          },
          relatedJarId: input.isFinanceManager ? undefined : null,
        },
        select: {
          id: true,
          goalName: true,
          targetAmount: true,
          deadline: true,
          monthlyContributionTarget: true,
          status: true,
        },
        orderBy: [{ status: 'desc' }, { deadline: 'asc' }],
        take: 5,
      }),
      this.prisma.goalContributionPlan.count({
        where: {
          familyId: input.familyId,
          status: GoalContributionPlanStatus.MISSED,
          memberId: input.isFinanceManager ? undefined : input.memberId,
        },
      }),
    ]);

    const goalProgress = await this.buildGoalProgress(goals);
    const totalExpense = monthlyCashflow?.totalExpense ?? 0;
    const expectedExpense = this.decimalToNumber(
      activeBudgetPlan?.expectedSharedExpense,
    );
    const budgetUsagePercent =
      expectedExpense && expectedExpense > 0
        ? Math.round((totalExpense / expectedExpense) * 100)
        : null;

    return {
      month: { month: input.month.month, year: input.month.year },
      monthlyCashflow,
      activeBudgetPlan: activeBudgetPlan
        ? {
            id: activeBudgetPlan.id,
            planName: activeBudgetPlan.planName,
            periodStart: activeBudgetPlan.periodStart,
            periodEnd: activeBudgetPlan.periodEnd,
            expectedSharedExpense: expectedExpense,
            lineCount: activeBudgetPlan._count.lines,
            usagePercent: budgetUsagePercent,
          }
        : null,
      budgetAlerts: budgetAlerts.map((alert) => ({
        ...alert,
        severityRank: this.severityRank(alert.severity),
      })),
      goals: goalProgress,
      atRiskGoalCount: goalProgress.filter((goal) => goal.isAtRisk).length,
      missedContributionPlanCount: missedPlans,
    };
  }

  private async buildMonthlyCashflow(
    ledgerId: string,
    month: { start: Date; end: Date },
  ): Promise<MonthlyCashflowBrief> {
    const rows = await this.prisma.ledgerEntry.groupBy({
      by: ['entryType'],
      where: {
        ledgerId,
        status: LedgerEntryStatus.ACTIVE,
        entryDate: { gte: month.start, lt: month.end },
      },
      _sum: { amount: true },
    });
    const totalIncome = rows
      .filter((row) => this.isCashInEntryType(row.entryType))
      .reduce(
        (sum, row) => sum + (this.decimalToNumber(row._sum.amount) ?? 0),
        0,
      );
    const totalExpense = rows
      .filter((row) => this.isCashOutEntryType(row.entryType))
      .reduce(
        (sum, row) => sum + (this.decimalToNumber(row._sum.amount) ?? 0),
        0,
      );
    return {
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
    };
  }

  private async buildGoalProgress(
    goals: Array<{
      id: string;
      goalName: string;
      targetAmount: Prisma.Decimal;
      deadline: Date | null;
      monthlyContributionTarget: Prisma.Decimal | null;
      status: FinancialGoalStatus;
    }>,
  ): Promise<GoalBrief[]> {
    if (goals.length === 0) return [];
    const goalIds = goals.map((goal) => goal.id);
    const allocationRows = await this.prisma.goalAllocation.groupBy({
      by: ['goalId'],
      where: { goalId: { in: goalIds } },
      _sum: { amount: true },
    });
    const allocatedByGoal = new Map(
      allocationRows.map((row) => [
        row.goalId,
        this.decimalToNumber(row._sum.amount),
      ]),
    );
    return goals.map((goal) => {
      const currentAmount = allocatedByGoal.get(goal.id) ?? 0;
      const targetAmount = this.decimalToNumber(goal.targetAmount) ?? 0;
      const progressPercent =
        targetAmount > 0
          ? Math.min(Math.round((currentAmount / targetAmount) * 100), 100)
          : 0;
      return {
        id: goal.id,
        goalName: goal.goalName,
        targetAmount,
        currentAmount,
        progressPercent,
        deadline: goal.deadline,
        monthlyContributionTarget: this.decimalToNumber(
          goal.monthlyContributionTarget,
        ),
        status: goal.status,
        isAtRisk: goal.status === FinancialGoalStatus.AT_RISK,
      };
    });
  }

  private buildInsights(
    task: Awaited<ReturnType<AiDailyBriefService['buildTaskBrief']>>,
    calendar: Awaited<ReturnType<AiDailyBriefService['buildCalendarBrief']>>,
    finance: Awaited<ReturnType<AiDailyBriefService['buildFinanceBrief']>>,
  ): BriefInsight[] {
    const insights: BriefInsight[] = [];
    if (task.overdueCount > 0) {
      insights.push({
        type: 'TASK_OVERDUE',
        severity: 'HIGH',
        relatedModule: AiRelatedModule.TASK,
        title: 'Có việc quá hạn',
        message: `${task.overdueCount} công việc của bạn đang quá hạn.`,
        actionPrompt: 'Tóm tắt các công việc quá hạn của tôi.',
      });
    }
    if (task.dueTodayCount > 0) {
      insights.push({
        type: 'TASK_DUE_TODAY',
        severity: 'MEDIUM',
        relatedModule: AiRelatedModule.TASK,
        title: 'Việc cần làm hôm nay',
        message: `${task.dueTodayCount} công việc đến hạn hôm nay.`,
        actionPrompt: 'Cho tôi xem các việc cần làm hôm nay.',
      });
    }
    if (calendar.upcomingCount > 0) {
      insights.push({
        type: 'CALENDAR_UPCOMING',
        severity: 'LOW',
        relatedModule: AiRelatedModule.CALENDAR,
        title: 'Lịch sắp tới',
        message: `${calendar.upcomingCount} sự kiện gia đình trong 7 ngày tới.`,
        actionPrompt: 'Tóm tắt lịch gia đình sắp tới.',
      });
    }
    const budgetUsage = finance.activeBudgetPlan?.usagePercent;
    if (
      budgetUsage !== null &&
      budgetUsage !== undefined &&
      budgetUsage >= 80
    ) {
      insights.push({
        type: 'BUDGET_USAGE',
        severity: budgetUsage >= 100 ? 'HIGH' : 'MEDIUM',
        relatedModule: AiRelatedModule.FINANCE,
        title:
          budgetUsage >= 100
            ? 'Ngân sách đã vượt'
            : 'Ngân sách gần chạm ngưỡng',
        message: `Chi tiêu tháng này đang ở mức ${budgetUsage}% kế hoạch.`,
        actionPrompt: 'Phân tích ngân sách tháng này và đề xuất điều chỉnh.',
      });
    }
    const highAlertCount = finance.budgetAlerts.filter(
      (alert) => alert.severity === BudgetAlertSeverity.HIGH,
    ).length;
    if (highAlertCount > 0) {
      insights.push({
        type: 'BUDGET_ALERT',
        severity: 'HIGH',
        relatedModule: AiRelatedModule.FINANCE,
        title: 'Có cảnh báo tài chính nghiêm trọng',
        message: `${highAlertCount} cảnh báo tài chính mức cao cần xem lại.`,
        actionPrompt: 'Tóm tắt các cảnh báo tài chính quan trọng.',
      });
    }
    if (finance.atRiskGoalCount > 0) {
      insights.push({
        type: 'GOAL_AT_RISK',
        severity: 'MEDIUM',
        relatedModule: AiRelatedModule.FINANCE,
        title: 'Mục tiêu tài chính có rủi ro',
        message: `${finance.atRiskGoalCount} mục tiêu tài chính có nguy cơ chậm tiến độ.`,
        actionPrompt: 'Phân tích các mục tiêu tài chính có rủi ro.',
      });
    }
    if (finance.missedContributionPlanCount > 0) {
      insights.push({
        type: 'GOAL_CONTRIBUTION_MISSED',
        severity: 'MEDIUM',
        relatedModule: AiRelatedModule.FINANCE,
        title: 'Có kế hoạch đóng góp bị trễ',
        message: `${finance.missedContributionPlanCount} kế hoạch đóng góp mục tiêu đang bị trễ.`,
        actionPrompt: 'Tóm tắt các kế hoạch đóng góp mục tiêu bị trễ.',
      });
    }
    return insights.sort(
      (left, right) =>
        this.severityRank(right.severity) - this.severityRank(left.severity),
    );
  }

  private suggestedPrompts(insights: BriefInsight[]) {
    const prompts = insights.slice(0, 3).map((insight) => ({
      label: insight.title,
      prompt: insight.actionPrompt,
      relatedModule: insight.relatedModule,
    }));
    if (prompts.length > 0) return prompts;
    return [
      {
        label: 'Phân tích chi tiêu',
        prompt: 'Phân tích chi tiêu tháng này của gia đình.',
        relatedModule: AiRelatedModule.FINANCE,
      },
      {
        label: 'Việc hôm nay',
        prompt: 'Tóm tắt các công việc cần chú ý hôm nay.',
        relatedModule: AiRelatedModule.TASK,
      },
      {
        label: 'Lịch sắp tới',
        prompt: 'Tóm tắt lịch gia đình trong 7 ngày tới.',
        relatedModule: AiRelatedModule.CALENDAR,
      },
    ];
  }

  private isFinanceManager(familyRole: FamilyRole) {
    return (
      familyRole === FamilyRole.FAMILY_MANAGER ||
      familyRole === FamilyRole.DEPUTY_MEMBER
    );
  }

  private vietnamDayRange(date: Date) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: VIETNAM_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const [year, month, day] = formatter.format(date).split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, day) - 7 * 60 * 60_000);
    return { start, end: this.addDays(start, 1) };
  }

  private vietnamMonthRange(date: Date) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: VIETNAM_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
    });
    const [year, month] = formatter.format(date).split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1) - 7 * 60 * 60_000);
    const end = new Date(Date.UTC(year, month, 1) - 7 * 60 * 60_000);
    return { start, end, month, year };
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60_000);
  }

  private vietnamDateKey(date: Date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: VIETNAM_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private decimalToNumber(value?: Prisma.Decimal | null) {
    return value ? value.toNumber() : null;
  }

  private isCashInEntryType(
    entryType: LedgerEntryType,
  ): entryType is (typeof CASH_IN_ENTRY_TYPES)[number] {
    return CASH_IN_ENTRY_TYPES.includes(
      entryType as (typeof CASH_IN_ENTRY_TYPES)[number],
    );
  }

  private isCashOutEntryType(
    entryType: LedgerEntryType,
  ): entryType is (typeof CASH_OUT_ENTRY_TYPES)[number] {
    return CASH_OUT_ENTRY_TYPES.includes(
      entryType as (typeof CASH_OUT_ENTRY_TYPES)[number],
    );
  }

  private severityRank(severity: InsightSeverity | BudgetAlertSeverity) {
    return { LOW: 1, MEDIUM: 2, HIGH: 3 }[severity];
  }
}
