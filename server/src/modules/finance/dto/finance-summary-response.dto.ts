import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BudgetAlertSeverity,
  BudgetAlertStatus,
  BudgetPlanStatus,
  EssentialType,
  FinanceLedgerStatus,
} from '@prisma/client';

class FinanceErrorResponseDto {
  @ApiProperty({ example: false })
  success!: boolean;

  @ApiProperty({
    example: 'Ngay ket thuc ky phai lon hon hoac bang ngay bat dau',
  })
  message!: string;

  @ApiProperty({ example: 400 })
  statusCode!: number;
}

export class FinanceBadRequestResponseDto extends FinanceErrorResponseDto {}
export class FinanceForbiddenResponseDto extends FinanceErrorResponseDto {}

class FinanceMonthPeriodResponseDto {
  @ApiProperty({ example: 6, minimum: 1, maximum: 12 })
  month!: number;

  @ApiProperty({ example: 2026 })
  year!: number;
}

class FinanceDateRangeResponseDto {
  @ApiProperty({
    example: '2026-06-01T00:00:00.000Z',
    description: 'UTC ISO datetime',
  })
  periodStart!: string;

  @ApiProperty({
    example: '2026-06-30T00:00:00.000Z',
    description: 'UTC ISO datetime',
  })
  periodEnd!: string;
}

class FinanceLedgerOverviewResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Shared Family Ledger' })
  ledgerName!: string;

  @ApiProperty({
    enum: FinanceLedgerStatus,
    example: FinanceLedgerStatus.ACTIVE,
  })
  status!: FinanceLedgerStatus;
}

class MemberMonthlyFinanceOverviewResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  memberId!: string;

  @ApiProperty({ example: 6 })
  periodMonth!: number;

  @ApiProperty({ example: 2026 })
  periodYear!: number;

  @ApiPropertyOptional({
    example: 15000000,
    nullable: true,
    description: 'VND, null when not declared or hidden by visibility',
  })
  expectedIncome!: number | null;

  @ApiPropertyOptional({
    example: 14500000,
    nullable: true,
    description: 'VND, null when not declared or hidden by visibility',
  })
  actualIncome!: number | null;

  @ApiPropertyOptional({
    example: 5000000,
    nullable: true,
    description: 'VND, null when not declared or hidden by visibility',
  })
  expectedPersonalExpense!: number | null;

  @ApiPropertyOptional({
    example: 4200000,
    nullable: true,
    description: 'VND, null when not declared or hidden by visibility',
  })
  actualPersonalExpense!: number | null;

  @ApiPropertyOptional({ example: 2000000, nullable: true, description: 'VND' })
  expectedSharedContribution!: number | null;

  @ApiPropertyOptional({ example: 1800000, nullable: true, description: 'VND' })
  actualSharedContribution!: number | null;
}

class FinanceOverviewDataResponseDto {
  @ApiProperty({ type: () => FinanceMonthPeriodResponseDto })
  period!: FinanceMonthPeriodResponseDto;

  @ApiProperty({ example: 'VND', description: 'Currency for all money fields' })
  currency!: string;

  @ApiProperty({ type: () => FinanceLedgerOverviewResponseDto, nullable: true })
  ledger!: FinanceLedgerOverviewResponseDto | null;

  @ApiProperty({ example: 12000000, description: 'VND' })
  totalIncome!: number;

  @ApiProperty({ example: 8500000, description: 'VND' })
  totalExpense!: number;

  @ApiProperty({ example: 3500000, description: 'VND' })
  balance!: number;

  @ApiProperty({ example: 18 })
  entryCount!: number;

  @ApiProperty({
    type: () => MemberMonthlyFinanceOverviewResponseDto,
    nullable: true,
  })
  monthlyFinance!: MemberMonthlyFinanceOverviewResponseDto | null;
}

export class FinanceOverviewApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Lấy tổng quan tài chính gia đình thành công' })
  message!: string;

  @ApiProperty({ type: () => FinanceOverviewDataResponseDto })
  data!: FinanceOverviewDataResponseDto;
}

class FinanceBudgetSummaryResponseDto {
  @ApiProperty({
    nullable: true,
    description:
      'Active budget plan object with lines. Null when no active plan exists. Lines can be an empty array.',
    example: {
      id: 'budget-plan-id',
      planName: 'Ngân sách tháng 6',
      status: BudgetPlanStatus.ACTIVE,
      lines: [],
    },
  })
  activeBudgetPlan!: Record<string, unknown> | null;

  @ApiProperty({ example: 15000000, description: 'VND' })
  plannedIncome!: number;

  @ApiProperty({ example: 12000000, description: 'VND' })
  plannedExpense!: number;

  @ApiProperty({ example: 14800000, description: 'VND' })
  actualIncome!: number;

  @ApiProperty({ example: 9700000, description: 'VND' })
  actualExpense!: number;

  @ApiProperty({ example: 3000000, description: 'VND' })
  plannedBalance!: number;

  @ApiProperty({ example: 5100000, description: 'VND' })
  actualBalance!: number;

  @ApiProperty({ example: -200000, description: 'VND' })
  incomeVariance!: number;

  @ApiProperty({ example: -2300000, description: 'VND' })
  expenseVariance!: number;

  @ApiProperty({ example: 1 })
  overBudgetLineCount!: number;
}

class FinanceSpendingCategoryResponseDto {
  @ApiProperty({ format: 'uuid', nullable: true })
  categoryId!: string | null;

  @ApiProperty({ example: 'Groceries' })
  name!: string;

  @ApiProperty({ enum: EssentialType, example: EssentialType.ESSENTIAL })
  essentialType!: EssentialType;

  @ApiProperty({ example: 3200000, description: 'VND' })
  amount!: number;
}

class FinanceSpendingSummaryResponseDto {
  @ApiProperty({ example: 9700000, description: 'VND' })
  totalExpense!: number;

  @ApiProperty({ example: 6800000, description: 'VND' })
  essentialExpense!: number;

  @ApiProperty({ example: 2100000, description: 'VND' })
  nonEssentialExpense!: number;

  @ApiProperty({ example: 21.65, description: 'Percent' })
  nonEssentialRatio!: number;

  @ApiProperty({
    type: () => [FinanceSpendingCategoryResponseDto],
    description: 'Empty array when includeBreakdown=false or no data',
  })
  byCategory!: FinanceSpendingCategoryResponseDto[];

  @ApiProperty({ type: () => [Object], example: [], description: 'Reserved' })
  byJar!: Array<Record<string, unknown>>;
}

class FinanceGoalSummaryResponseDto {
  @ApiProperty({ example: 3 })
  totalGoals!: number;

  @ApiProperty({ example: 2 })
  activeGoals!: number;

  @ApiProperty({ example: 1 })
  achievedGoals!: number;

  @ApiProperty({ example: 0 })
  atRiskGoals!: number;

  @ApiProperty({ example: 50000000, description: 'VND' })
  totalTargetAmount!: number;

  @ApiProperty({ example: 18500000, description: 'VND' })
  totalCurrentAmount!: number;

  @ApiProperty({ example: 37, description: 'Percent' })
  averageProgressPercent!: number;

  @ApiProperty({
    type: () => [Object],
    description: 'Empty array when no goals',
  })
  items!: Array<Record<string, unknown>>;
}

class FinanceAlertSummaryResponseDto {
  @ApiProperty({ example: 2 })
  totalNew!: number;

  @ApiProperty({ example: 1 })
  totalAcknowledged!: number;

  @ApiProperty({ example: 5 })
  totalResolved!: number;

  @ApiProperty({ example: 1 })
  highCount!: number;

  @ApiProperty({ example: 2 })
  mediumCount!: number;

  @ApiProperty({ example: 0 })
  lowCount!: number;

  @ApiProperty({
    type: () => [Object],
    description: `Latest alerts, status enum ${Object.values(BudgetAlertStatus).join(', ')}, severity enum ${Object.values(BudgetAlertSeverity).join(', ')}`,
  })
  latest!: Array<Record<string, unknown>>;
}

class FinanceSummaryDataResponseDto {
  @ApiProperty({ type: () => FinanceDateRangeResponseDto })
  period!: FinanceDateRangeResponseDto;

  @ApiProperty({ example: 'VND', description: 'Currency for all money fields' })
  currency!: string;

  @ApiProperty({ type: () => FinanceBudgetSummaryResponseDto })
  budget!: FinanceBudgetSummaryResponseDto;

  @ApiProperty({ type: () => FinanceGoalSummaryResponseDto, nullable: true })
  goals!: FinanceGoalSummaryResponseDto | null;

  @ApiProperty({ type: () => FinanceSpendingSummaryResponseDto })
  spending!: FinanceSpendingSummaryResponseDto;

  @ApiProperty({ type: () => FinanceAlertSummaryResponseDto, nullable: true })
  alerts!: FinanceAlertSummaryResponseDto | null;
}

export class FinanceSummaryApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Lấy tóm tắt tài chính gia đình thành công' })
  message!: string;

  @ApiProperty({ type: () => FinanceSummaryDataResponseDto })
  data!: FinanceSummaryDataResponseDto;
}

class CashFlowTotalsResponseDto {
  @ApiProperty({ example: 14800000, description: 'VND' })
  incomeAmount!: number;

  @ApiProperty({ example: 9700000, description: 'VND' })
  expenseAmount!: number;

  @ApiProperty({ example: 0, description: 'VND' })
  adjustmentAmount!: number;

  @ApiProperty({ example: 5100000, description: 'VND, income - expense' })
  netCashFlow!: number;

  @ApiProperty({
    example: 5100000,
    description: 'VND, income - expense + adjustment',
  })
  netIncludingAdjustments!: number;

  @ApiProperty({ example: 18 })
  entryCount!: number;
}

class CashFlowMonthResponseDto extends CashFlowTotalsResponseDto {
  @ApiProperty({ example: '2026-06' })
  month!: string;
}

class CashFlowSummaryDataResponseDto {
  @ApiProperty({ type: () => FinanceDateRangeResponseDto })
  period!: FinanceDateRangeResponseDto;

  @ApiProperty({ example: 'VND', description: 'Currency for all money fields' })
  currency!: string;

  @ApiProperty({ type: () => CashFlowTotalsResponseDto })
  totals!: CashFlowTotalsResponseDto;

  @ApiProperty({
    type: () => [CashFlowMonthResponseDto],
    description: 'Empty array when no ledger entries in period',
  })
  byMonth!: CashFlowMonthResponseDto[];
}

export class CashFlowSummaryApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Lấy tóm tắt dòng tiền gia đình thành công' })
  message!: string;

  @ApiProperty({ type: () => CashFlowSummaryDataResponseDto })
  data!: CashFlowSummaryDataResponseDto;
}

class CategorySpendingSummaryDataResponseDto {
  @ApiProperty({ type: () => FinanceDateRangeResponseDto })
  period!: FinanceDateRangeResponseDto;

  @ApiProperty({ example: 'VND', description: 'Currency for all money fields' })
  currency!: string;

  @ApiProperty({ example: 9700000, description: 'VND' })
  totalExpense!: number;

  @ApiProperty({ example: 6800000, description: 'VND' })
  essentialExpense!: number;

  @ApiProperty({ example: 2100000, description: 'VND' })
  nonEssentialExpense!: number;

  @ApiProperty({ example: 21.65, description: 'Percent' })
  nonEssentialRatio!: number;

  @ApiProperty({
    type: () => [FinanceSpendingCategoryResponseDto],
    description: 'Empty array when no spending in period',
  })
  byCategory!: FinanceSpendingCategoryResponseDto[];
}

export class CategorySpendingSummaryApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Lấy tóm tắt chi tiêu theo danh mục thành công' })
  message!: string;

  @ApiProperty({ type: () => CategorySpendingSummaryDataResponseDto })
  data!: CategorySpendingSummaryDataResponseDto;
}

class FinanceMemberUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Nguyen Van A', nullable: true })
  fullName!: string | null;

  @ApiProperty({ example: 'https://example.com/avatar.png', nullable: true })
  avatarUrl!: string | null;
}

class FinanceMemberSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Ba' })
  displayName!: string | null;

  @ApiProperty({ type: () => FinanceMemberUserResponseDto })
  user!: FinanceMemberUserResponseDto;
}

class MemberContributionSummaryItemResponseDto {
  @ApiProperty({ type: () => FinanceMemberSummaryResponseDto })
  member!: FinanceMemberSummaryResponseDto;

  @ApiProperty({ example: 1800000, description: 'VND, from monthly finance' })
  sharedContribution!: number;

  @ApiProperty({
    example: 1500000,
    description: 'VND, approved contribution linked to a contribution plan',
  })
  goalContribution!: number;

  @ApiProperty({
    example: 1500000,
    description: 'VND, all CONTRIBUTION ledger entries for auditing',
  })
  ledgerContributionTotal!: number;

  @ApiProperty({
    example: 3300000,
    description: 'VND, sharedContribution + goalContribution',
  })
  totalContribution!: number;
}

class MemberContributionTotalsResponseDto {
  @ApiProperty({ example: 5000000, description: 'VND' })
  sharedContribution!: number;

  @ApiProperty({ example: 4000000, description: 'VND' })
  goalContribution!: number;

  @ApiProperty({ example: 4000000, description: 'VND' })
  ledgerContributionTotal!: number;

  @ApiProperty({ example: 9000000, description: 'VND' })
  totalContribution!: number;
}

class MemberContributionSummaryDataResponseDto {
  @ApiProperty({ type: () => FinanceDateRangeResponseDto })
  period!: FinanceDateRangeResponseDto;

  @ApiProperty({ example: 'VND', description: 'Currency for all money fields' })
  currency!: string;

  @ApiProperty({ type: () => MemberContributionTotalsResponseDto })
  totals!: MemberContributionTotalsResponseDto;

  @ApiProperty({
    type: () => [MemberContributionSummaryItemResponseDto],
    description:
      'Manager/deputy sees all active members; normal member sees only themself. Empty array when no visible active member.',
  })
  members!: MemberContributionSummaryItemResponseDto[];
}

export class MemberContributionSummaryApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Lấy tóm tắt đóng góp theo thành viên thành công' })
  message!: string;

  @ApiProperty({ type: () => MemberContributionSummaryDataResponseDto })
  data!: MemberContributionSummaryDataResponseDto;
}

export const FINANCE_OVERVIEW_RESPONSE_EXAMPLE = {
  success: true,
  message: 'Lấy tổng quan tài chính gia đình thành công',
  data: {
    period: { month: 6, year: 2026 },
    currency: 'VND',
    ledger: {
      id: 'ledger-id',
      ledgerName: 'Shared Family Ledger',
      status: 'ACTIVE',
    },
    totalIncome: 12000000,
    totalExpense: 8500000,
    balance: 3500000,
    entryCount: 18,
    monthlyFinance: null,
  },
};

export const FINANCE_SUMMARY_RESPONSE_EXAMPLE = {
  success: true,
  message: 'Lấy tóm tắt tài chính gia đình thành công',
  data: {
    period: {
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-06-30T00:00:00.000Z',
    },
    currency: 'VND',
    budget: {
      activeBudgetPlan: {
        id: 'budget-plan-id',
        planName: 'Ngân sách tháng 6',
        status: 'ACTIVE',
        lines: [],
      },
      plannedIncome: 15000000,
      plannedExpense: 12000000,
      actualIncome: 14800000,
      actualExpense: 9700000,
      plannedBalance: 3000000,
      actualBalance: 5100000,
      incomeVariance: -200000,
      expenseVariance: -2300000,
      overBudgetLineCount: 1,
    },
    goals: {
      totalGoals: 3,
      activeGoals: 2,
      achievedGoals: 1,
      atRiskGoals: 0,
      totalTargetAmount: 50000000,
      totalCurrentAmount: 18500000,
      averageProgressPercent: 37,
      items: [],
    },
    spending: {
      totalExpense: 9700000,
      essentialExpense: 6800000,
      nonEssentialExpense: 2100000,
      nonEssentialRatio: 21.65,
      byCategory: [],
      byJar: [],
    },
    alerts: {
      totalNew: 2,
      totalAcknowledged: 1,
      totalResolved: 5,
      highCount: 1,
      mediumCount: 2,
      lowCount: 0,
      latest: [],
    },
  },
};

export const CASH_FLOW_SUMMARY_RESPONSE_EXAMPLE = {
  success: true,
  message: 'Lấy tóm tắt dòng tiền gia đình thành công',
  data: {
    period: {
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-06-30T00:00:00.000Z',
    },
    currency: 'VND',
    totals: {
      incomeAmount: 14800000,
      expenseAmount: 9700000,
      adjustmentAmount: 0,
      netCashFlow: 5100000,
      netIncludingAdjustments: 5100000,
      entryCount: 18,
    },
    byMonth: [
      {
        month: '2026-06',
        incomeAmount: 14800000,
        expenseAmount: 9700000,
        adjustmentAmount: 0,
        netCashFlow: 5100000,
        netIncludingAdjustments: 5100000,
        entryCount: 18,
      },
    ],
  },
};

export const CATEGORY_SPENDING_SUMMARY_RESPONSE_EXAMPLE = {
  success: true,
  message: 'Lấy tóm tắt chi tiêu theo danh mục thành công',
  data: {
    period: {
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-06-30T00:00:00.000Z',
    },
    currency: 'VND',
    totalExpense: 9700000,
    essentialExpense: 6800000,
    nonEssentialExpense: 2100000,
    nonEssentialRatio: 21.65,
    byCategory: [
      {
        categoryId: 'category-id',
        name: 'Groceries',
        essentialType: 'ESSENTIAL',
        amount: 3200000,
      },
    ],
  },
};

export const MEMBER_CONTRIBUTION_SUMMARY_RESPONSE_EXAMPLE = {
  success: true,
  message: 'Lấy tóm tắt đóng góp theo thành viên thành công',
  data: {
    period: {
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-06-30T00:00:00.000Z',
    },
    currency: 'VND',
    totals: {
      sharedContribution: 5000000,
      goalContribution: 4000000,
      ledgerContributionTotal: 4000000,
      totalContribution: 9000000,
    },
    members: [
      {
        member: {
          id: 'member-id',
          displayName: 'Ba',
          user: {
            id: 'user-id',
            fullName: 'Nguyen Van A',
            avatarUrl: null,
          },
        },
        sharedContribution: 1800000,
        goalContribution: 1500000,
        ledgerContributionTotal: 1500000,
        totalContribution: 3300000,
      },
    ],
  },
};
