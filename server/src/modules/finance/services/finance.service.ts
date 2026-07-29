import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BudgetPlanStatus,
  EssentialType,
  FinanceCategoryStatus,
  FinanceLedgerStatus,
  FinanceModelStatus,
  FinanceModelType,
  FinanceVisibility,
  FinancialGoalStatus,
  FamilyRole,
  GoalContributionPlanStatus,
  LedgerEntryStatus,
  LedgerEntryType,
  MemberMonthlyFinance,
  MemberStatus,
  Prisma,
} from '@prisma/client';

import {
  buildPaginated,
  skipFor,
} from '../../../common/types/paginated-result';
import { PrismaService } from '../../../prisma/prisma.service';
import { FINANCE_MODEL_TEMPLATES } from '../constants/finance-model-templates.constant';
import { BudgetPlanQueryDto } from '../dto/budget-plan-query.dto';
import { CreateBudgetLineDto } from '../dto/create-budget-line.dto';
import { CreateBudgetPlanDto } from '../dto/create-budget-plan.dto';
import { CreateFinanceCategoryDto } from '../dto/create-finance-category.dto';
import { CreateFinanceJarDto } from '../dto/create-finance-jar.dto';
import { CreateFinanceModelDto } from '../dto/create-finance-model.dto';
import { CreateFundAllocationDto } from '../dto/create-fund-allocation.dto';
import { CreateLedgerEntryDto } from '../dto/create-ledger-entry.dto';
import { CreateMemberMonthlyFinanceDto } from '../dto/create-member-monthly-finance.dto';
import {
  FinanceCategoryJarMappingQueryDto,
  UpsertFinanceCategoryJarMappingDto,
} from '../dto/finance-category-jar-mapping.dto';
import { FundAllocationQueryDto } from '../dto/fund-allocation-query.dto';
import { LedgerEntryQueryDto } from '../dto/ledger-entry-query.dto';
import {
  OptionalFinancePeriodDto,
  RequiredFinancePeriodDto,
} from '../dto/finance-period.dto';
import { UpdateBudgetLineDto } from '../dto/update-budget-line.dto';
import { UpdateBudgetPlanDto } from '../dto/update-budget-plan.dto';
import { UpdateFinanceCategoryDto } from '../dto/update-finance-category.dto';
import { UpdateMemberMonthlyFinanceDto } from '../dto/update-member-monthly-finance.dto';
import { UpdateFinanceJarDto } from '../dto/update-finance-jar.dto';
import { UpdateLedgerEntryDto } from '../dto/update-ledger-entry.dto';

type MonthlyGoalContributionSummaryItem = {
  goalId: string;
  goalName: string;
  goalStatus: FinancialGoalStatus;
  relatedJarId: string | null;
  contributionPlanId: string | null;
  plannedAmount: number;
  pendingAmount: number | null;
  actualAmount: number;
  shortageAmount: number;
  dueDate: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  status: GoalContributionPlanStatus | null;
};

type FundAllocationModelSummary = {
  id: string;
  name: string | null;
  modelType: FinanceModelType | null;
};

type FundAllocationEntryRow = {
  id: string;
  ledgerId: string;
  categoryId: string | null;
  jarId: string | null;
  createdByMemberId: string;
  entryType: LedgerEntryType;
  amount: Prisma.Decimal;
  description: string;
  note: string | null;
  entryDate: Date;
  status: LedgerEntryStatus;
  sourceType: string | null;
  sourceId: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  jar: {
    id: string;
    financeModelId: string;
    name: string;
    jarCode: string;
    allocationPercentage: Prisma.Decimal;
    description: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    financeModel?: FundAllocationModelSummary;
  } | null;
};

type FundAllocationSnapshot = {
  model: FundAllocationModelSummary;
  period: { month: number; year: number };
  sourceType: typeof MODEL_FUND_ALLOCATION_SOURCE;
  sourceId: string;
  jar: {
    id: string;
    financeModelId: string;
    name: string;
    jarCode: string;
    allocationPercentage: number;
    description: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
  amount: number;
};

const MODEL_FUND_ALLOCATION_SOURCE = 'MODEL_FUND_ALLOCATION';
const MONTHLY_SURPLUS_TO_GOAL_SOURCE = 'MONTHLY_SURPLUS_TO_GOAL';
const FUND_ALLOCATION_ERROR_CODES = {
  ALREADY_EXISTS: 'FUND_ALLOCATION_ALREADY_EXISTS',
  NO_ACTIVE_FINANCE_MODEL: 'NO_ACTIVE_FINANCE_MODEL',
  INVALID_FINANCE_MODEL: 'INVALID_FINANCE_MODEL',
  INVALID_JAR_PERCENTAGE: 'INVALID_JAR_PERCENTAGE',
  INSUFFICIENT_AVAILABLE_FUND: 'INSUFFICIENT_AVAILABLE_FUND',
} as const;
const FAMILY_FUND_CASH_IN_TYPES = [
  LedgerEntryType.INCOME,
  LedgerEntryType.CONTRIBUTION,
] as const;
const FAMILY_FUND_CASH_OUT_TYPES = [
  LedgerEntryType.EXPENSE,
  LedgerEntryType.SUPPORT,
  LedgerEntryType.ALLOWANCE,
  LedgerEntryType.REWARD,
] as const;

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  getMyMonthlyFinance(memberId: string, period: RequiredFinancePeriodDto) {
    return this.prisma.memberMonthlyFinance.findUnique({
      where: {
        memberId_periodMonth_periodYear: {
          memberId,
          periodMonth: period.month,
          periodYear: period.year,
        },
      },
    });
  }

  async getMemberMonthlyFinance(
    familyId: string,
    viewerMemberId: string,
    targetMemberId: string,
    period: RequiredFinancePeriodDto,
  ) {
    const viewer = await this.getMemberInFamilyOrThrow(
      familyId,
      viewerMemberId,
    );
    this.assertCanViewMemberFinance(viewer, targetMemberId);
    await this.getMemberInFamilyOrThrow(familyId, targetMemberId);

    const monthlyFinance = await this.getMyMonthlyFinance(
      targetMemberId,
      period,
    );
    return this.buildMonthlyFinanceView(
      monthlyFinance,
      viewer.id === targetMemberId,
    );
  }

  getMyMonthlySummary(
    familyId: string,
    memberId: string,
    period: RequiredFinancePeriodDto,
  ) {
    return this.getMemberMonthlySummary(familyId, memberId, memberId, period);
  }

  async getMemberMonthlySummary(
    familyId: string,
    viewerMemberId: string,
    targetMemberId: string,
    period: RequiredFinancePeriodDto,
  ) {
    const viewer = await this.getMemberInFamilyOrThrow(
      familyId,
      viewerMemberId,
    );
    this.assertCanViewMemberFinance(viewer, targetMemberId);
    const targetMember = await this.getMemberInFamilyOrThrow(
      familyId,
      targetMemberId,
    );
    const { start, end } = this.periodRange(period.month, period.year);
    const visibleGoalWhere = this.visibleFinancialGoalWhere(
      familyId,
      viewer.familyRole,
    );

    const [monthlyFinance, contributionEntries, plans, allocations] =
      await this.prisma.$transaction([
        this.prisma.memberMonthlyFinance.findUnique({
          where: {
            memberId_periodMonth_periodYear: {
              memberId: targetMemberId,
              periodMonth: period.month,
              periodYear: period.year,
            },
          },
        }),
        this.prisma.ledgerEntry.findMany({
          where: {
            ledger: { familyId },
            createdByMemberId: targetMemberId,
            entryType: LedgerEntryType.CONTRIBUTION,
            status: LedgerEntryStatus.ACTIVE,
            entryDate: { gte: start, lt: end },
          },
          select: {
            amount: true,
            goalAllocations: { select: { amount: true } },
          },
        }),
        this.prisma.goalContributionPlan.findMany({
          where: {
            familyId,
            memberId: targetMemberId,
            periodMonth: period.month,
            periodYear: period.year,
            goal: visibleGoalWhere,
          },
          include: {
            goal: {
              select: {
                id: true,
                goalName: true,
                status: true,
                deadline: true,
                monthlyContributionTarget: true,
                relatedJarId: true,
              },
            },
          },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        }),
        this.prisma.goalAllocation.findMany({
          where: {
            goal: visibleGoalWhere,
            ledgerEntry: {
              ledger: { familyId },
              createdByMemberId: targetMemberId,
              entryType: LedgerEntryType.CONTRIBUTION,
              status: LedgerEntryStatus.ACTIVE,
              entryDate: { gte: start, lt: end },
            },
          },
          select: {
            amount: true,
            goalId: true,
            goal: {
              select: {
                id: true,
                goalName: true,
                status: true,
                deadline: true,
                monthlyContributionTarget: true,
                relatedJarId: true,
              },
            },
          },
        }),
      ]);

    const canViewPrivateFinance = viewer.id === targetMemberId;
    const familyFundLedgerAmount = contributionEntries.reduce((sum, entry) => {
      const allocatedAmount = entry.goalAllocations.reduce(
        (allocated, allocation) => allocated.plus(allocation.amount),
        new Prisma.Decimal(0),
      );
      return sum.plus(
        Prisma.Decimal.max(entry.amount.minus(allocatedAmount), 0),
      );
    }, new Prisma.Decimal(0));

    const actualAmountByGoal = new Map<string, Prisma.Decimal>();
    const goalById = new Map<string, (typeof allocations)[number]['goal']>();
    for (const allocation of allocations) {
      actualAmountByGoal.set(
        allocation.goalId,
        (
          actualAmountByGoal.get(allocation.goalId) ?? new Prisma.Decimal(0)
        ).plus(allocation.amount),
      );
      goalById.set(allocation.goalId, allocation.goal);
    }

    const goalItems: MonthlyGoalContributionSummaryItem[] = plans.map(
      (plan) => {
        const actualAmount =
          actualAmountByGoal.get(plan.goalId) ?? new Prisma.Decimal(0);
        actualAmountByGoal.delete(plan.goalId);
        const shortageAmount = Prisma.Decimal.max(
          plan.plannedAmount.minus(actualAmount),
          0,
        );
        return {
          goalId: plan.goalId,
          goalName: plan.goal.goalName,
          goalStatus: plan.goal.status,
          relatedJarId: plan.goal.relatedJarId,
          contributionPlanId: plan.id,
          plannedAmount: this.decimalToNumber(plan.plannedAmount),
          pendingAmount: this.decimalToNumberOrNull(plan.pendingAmount),
          actualAmount: this.decimalToNumber(actualAmount),
          shortageAmount: this.decimalToNumber(shortageAmount),
          dueDate: this.dateKey(plan.dueDate),
          submittedAt: plan.submittedAt,
          reviewedAt: plan.reviewedAt,
          status: this.computeContributionPlanStatus(
            plan.plannedAmount,
            actualAmount,
            plan.dueDate,
            plan.status,
          ),
        };
      },
    );

    for (const [goalId, actualAmount] of actualAmountByGoal) {
      const goal = goalById.get(goalId);
      if (!goal) continue;
      goalItems.push({
        goalId,
        goalName: goal.goalName,
        goalStatus: goal.status,
        relatedJarId: goal.relatedJarId,
        contributionPlanId: null,
        plannedAmount: 0,
        pendingAmount: null,
        actualAmount: this.decimalToNumber(actualAmount),
        shortageAmount: 0,
        dueDate: goal.deadline ? this.dateKey(goal.deadline) : null,
        submittedAt: null,
        reviewedAt: null,
        status: null,
      });
    }

    const totalPlannedAmount = goalItems.reduce(
      (sum, item) => sum + item.plannedAmount,
      0,
    );
    const totalActualAmount = goalItems.reduce(
      (sum, item) => sum + item.actualAmount,
      0,
    );
    const totalShortageAmount = goalItems.reduce(
      (sum, item) => sum + item.shortageAmount,
      0,
    );
    const declaredSharedActual = monthlyFinance?.actualSharedContribution;

    return {
      period: { month: period.month, year: period.year },
      member: {
        id: targetMember.id,
        displayName: this.memberDisplayName(targetMember),
      },
      monthlyFinance: this.buildMonthlyFinanceSummaryView(
        monthlyFinance,
        canViewPrivateFinance,
      ),
      familyFundContribution: {
        plannedAmount: this.decimalToNumberOrNull(
          monthlyFinance?.expectedSharedContribution,
        ),
        declaredActualAmount: this.decimalToNumberOrNull(declaredSharedActual),
        ledgerActualAmount: this.decimalToNumber(familyFundLedgerAmount),
        actualAmount: declaredSharedActual
          ? this.decimalToNumber(declaredSharedActual)
          : this.decimalToNumber(familyFundLedgerAmount),
      },
      goalContributions: {
        totalPlannedAmount,
        totalActualAmount,
        totalShortageAmount,
        items: goalItems,
      },
    };
  }

  async createMyMonthlyFinance(
    memberId: string,
    dto: CreateMemberMonthlyFinanceDto,
  ) {
    try {
      return await this.prisma.memberMonthlyFinance.create({
        data: {
          memberId,
          ...dto,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Thông tin tài chính của tháng này đã tồn tại',
        );
      }
      throw error;
    }
  }

  async updateMyMonthlyFinance(
    memberId: string,
    dto: UpdateMemberMonthlyFinanceDto,
  ) {
    const { periodMonth, periodYear, ...values } = dto;

    try {
      return await this.prisma.memberMonthlyFinance.update({
        where: {
          memberId_periodMonth_periodYear: {
            memberId,
            periodMonth,
            periodYear,
          },
        },
        data: values,
      });
    } catch (error) {
      if (this.isRecordNotFoundError(error)) {
        throw new NotFoundException(
          'Không tìm thấy thông tin tài chính của tháng này',
        );
      }
      throw error;
    }
  }

  listFinanceModelTemplates() {
    return FINANCE_MODEL_TEMPLATES;
  }

  listFinanceModels(familyId: string, familyRole: FamilyRole) {
    return this.prisma.financeModel.findMany({
      where: {
        familyId,
        status: this.isFinanceManager(familyRole)
          ? undefined
          : FinanceModelStatus.ACTIVE,
      },
      include: { _count: { select: { jars: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  createFinanceModel(familyId: string, dto: CreateFinanceModelDto) {
    return this.prisma.$transaction(async (tx) => {
      const model = await tx.financeModel.create({
        data: {
          familyId,
          modelType: dto.modelType,
          name: dto.name.trim(),
        },
      });

      await this.createDefaultJars(tx, model.id, dto.modelType);

      return tx.financeModel.findUniqueOrThrow({
        where: { id: model.id },
        include: { jars: { orderBy: { createdAt: 'asc' } } },
      });
    });
  }

  activateFinanceModel(familyId: string, modelId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const model = await tx.financeModel.findFirst({
          where: { id: modelId, familyId },
          include: { _count: { select: { jars: true } } },
        });
        if (!model) {
          throw new NotFoundException(
            'Không tìm thấy mô hình tài chính trong gia đình này',
          );
        }

        if (model._count.jars === 0) {
          await this.createDefaultJars(tx, model.id, model.modelType);
        }
        await this.assertJarAllocationWithinLimit(tx, model.id);

        await tx.financeModel.updateMany({
          where: {
            familyId,
            status: FinanceModelStatus.ACTIVE,
            id: { not: modelId },
          },
          data: { status: FinanceModelStatus.INACTIVE },
        });

        return tx.financeModel.update({
          where: { id: modelId },
          data: { status: FinanceModelStatus.ACTIVE },
          include: { jars: { orderBy: { createdAt: 'asc' } } },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  allocateFundByModel(
    familyId: string,
    memberId: string,
    dto: CreateFundAllocationDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const model = await tx.financeModel.findFirst({
          where: {
            familyId,
            id: dto.modelId,
            status: FinanceModelStatus.ACTIVE,
          },
          include: {
            jars: {
              where: { isActive: true },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { updatedAt: 'desc' },
        });
        if (!model) {
          throw new NotFoundException({
            message:
              'Không tìm thấy mô hình tài chính đang hoạt động trong gia đình này',
            code: dto.modelId
              ? FUND_ALLOCATION_ERROR_CODES.INVALID_FINANCE_MODEL
              : FUND_ALLOCATION_ERROR_CODES.NO_ACTIVE_FINANCE_MODEL,
          });
        }
        if (model.jars.length === 0) {
          throw new BadRequestException({
            message: 'Mô hình tài chính đang hoạt động chưa có hũ để chia quỹ',
            code: FUND_ALLOCATION_ERROR_CODES.INVALID_FINANCE_MODEL,
          });
        }

        const totalPercentage = model.jars.reduce(
          (sum, jar) => sum.plus(jar.allocationPercentage),
          new Prisma.Decimal(0),
        );
        if (!totalPercentage.equals(100)) {
          throw new BadRequestException({
            message:
              'Tổng tỷ lệ phân bổ của các hũ hoạt động phải bằng 100% để chia quỹ',
            code: FUND_ALLOCATION_ERROR_CODES.INVALID_JAR_PERCENTAGE,
          });
        }

        const sourceId = `${model.id}:${this.periodKey(
          dto.periodMonth,
          dto.periodYear,
        )}`;
        const existingAllocation = await tx.ledgerEntry.findFirst({
          where: {
            ledger: { familyId },
            sourceType: MODEL_FUND_ALLOCATION_SOURCE,
            sourceId: {
              endsWith: `:${this.periodKey(dto.periodMonth, dto.periodYear)}`,
            },
            status: LedgerEntryStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (existingAllocation) {
          throw new ConflictException({
            message: 'Ky nay da co lan chia quy',
            code: FUND_ALLOCATION_ERROR_CODES.ALREADY_EXISTS,
          });
        }

        const ledger = await tx.financeLedger.upsert({
          where: { familyId },
          create: {
            familyId,
            ledgerName: 'Shared Family Ledger',
            status: FinanceLedgerStatus.ACTIVE,
          },
          update: {},
        });

        const totalAmount = new Prisma.Decimal(dto.amount).toDecimalPlaces(2);
        const availableFund = await this.calculateAvailableFamilyFund(
          tx,
          ledger.id,
          dto.periodMonth,
          dto.periodYear,
        );
        if (totalAmount.greaterThan(availableFund)) {
          throw new BadRequestException({
            message: 'Số tiền chia quỹ vượt quá quỹ khả dụng của kỳ này',
            code: FUND_ALLOCATION_ERROR_CODES.INSUFFICIENT_AVAILABLE_FUND,
          });
        }

        const entryDate = this.monthEndDate(dto.periodMonth, dto.periodYear);
        let allocatedAmount = new Prisma.Decimal(0);
        const entries: Prisma.LedgerEntryGetPayload<{
          include: { jar: true };
        }>[] = [];
        const items: Array<{
          jarId: string;
          jarName: string;
          jarCode: string;
          allocationPercentage: number;
          amount: number;
          ledgerEntryId: string;
        }> = [];
        for (let index = 0; index < model.jars.length; index += 1) {
          const jar = model.jars[index];
          const isLastJar = index === model.jars.length - 1;
          const amount = isLastJar
            ? totalAmount.minus(allocatedAmount).toDecimalPlaces(2)
            : totalAmount
                .times(jar.allocationPercentage)
                .dividedBy(100)
                .toDecimalPlaces(2);
          allocatedAmount = allocatedAmount.plus(amount);

          const snapshot = this.buildFundAllocationSnapshot({
            model: {
              id: model.id,
              name: model.name,
              modelType: model.modelType,
            },
            period: { month: dto.periodMonth, year: dto.periodYear },
            sourceId,
            jar: {
              id: jar.id,
              financeModelId: jar.financeModelId,
              name: jar.name,
              jarCode: jar.jarCode,
              allocationPercentage: this.decimalToNumber(
                jar.allocationPercentage,
              ),
              description: jar.description,
              isActive: jar.isActive,
              createdAt: jar.createdAt,
              updatedAt: jar.updatedAt,
            },
            amount,
          });
          const entry = await tx.ledgerEntry.create({
            data: {
              ledgerId: ledger.id,
              jarId: jar.id,
              createdByMemberId: memberId,
              entryType: LedgerEntryType.ADJUSTMENT,
              amount,
              description: `Chia quỹ vào hũ ${jar.name}`,
              note: dto.note?.trim(),
              entryDate,
              sourceType: MODEL_FUND_ALLOCATION_SOURCE,
              sourceId,
              metadata: { fundAllocationSnapshot: snapshot },
              status: LedgerEntryStatus.ACTIVE,
            },
            include: { jar: true },
          });
          entries.push(entry);
          items.push({
            jarId: jar.id,
            jarName: jar.name,
            jarCode: jar.jarCode,
            allocationPercentage: this.decimalToNumber(
              jar.allocationPercentage,
            ),
            amount: this.decimalToNumber(amount),
            ledgerEntryId: entry.id,
          });
        }

        return {
          model: {
            id: model.id,
            name: model.name,
            modelType: model.modelType,
          },
          period: { month: dto.periodMonth, year: dto.periodYear },
          totalAmount: this.decimalToNumber(totalAmount),
          createdAt: entries[0]?.createdAt ?? new Date(),
          createdByMemberId: memberId,
          note: dto.note?.trim() ?? null,
          sourceType: MODEL_FUND_ALLOCATION_SOURCE,
          sourceId,
          items,
          entries,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listFundAllocations(familyId: string, query: FundAllocationQueryDto) {
    const hasPeriodMonth = query.periodMonth !== undefined;
    const hasPeriodYear = query.periodYear !== undefined;
    if (hasPeriodMonth !== hasPeriodYear) {
      throw new BadRequestException(
        'Vui lòng truyền đồng thời periodMonth và periodYear khi lọc theo kỳ chia quỹ',
      );
    }

    const sourceIdFilter: Prisma.StringNullableFilter = { not: null };
    if (query.modelId && hasPeriodMonth && hasPeriodYear) {
      sourceIdFilter.equals = `${query.modelId}:${this.periodKey(
        query.periodMonth!,
        query.periodYear!,
      )}`;
    } else if (query.modelId) {
      sourceIdFilter.startsWith = `${query.modelId}:`;
    } else if (hasPeriodMonth && hasPeriodYear) {
      sourceIdFilter.endsWith = `:${this.periodKey(
        query.periodMonth!,
        query.periodYear!,
      )}`;
    }

    const entries = (await this.prisma.ledgerEntry.findMany({
      where: {
        ledger: { familyId },
        status: LedgerEntryStatus.ACTIVE,
        sourceType: MODEL_FUND_ALLOCATION_SOURCE,
        sourceId: sourceIdFilter,
      },
      include: {
        jar: {
          include: {
            financeModel: {
              select: { id: true, name: true, modelType: true },
            },
          },
        },
      },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    })) as FundAllocationEntryRow[];

    const grouped = new Map<string, FundAllocationEntryRow[]>();
    for (const entry of entries) {
      if (!entry.sourceId) continue;
      const group = grouped.get(entry.sourceId) ?? [];
      group.push(entry);
      grouped.set(entry.sourceId, group);
    }

    const allocations = [...grouped.entries()]
      .map(([sourceId, group]) =>
        this.buildFundAllocationHistoryItem(sourceId, group),
      )
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      );

    return buildPaginated(
      allocations.slice(
        skipFor(query.page, query.limit),
        query.page * query.limit,
      ),
      allocations.length,
      query.page,
      query.limit,
    );
  }

  listFinanceJars(familyId: string, familyRole: FamilyRole) {
    const manager = this.isFinanceManager(familyRole);
    return this.prisma.financeJar.findMany({
      where: {
        financeModel: {
          familyId,
          status: manager ? undefined : FinanceModelStatus.ACTIVE,
        },
        isActive: manager ? undefined : true,
      },
      include: {
        financeModel: {
          select: { id: true, name: true, modelType: true, status: true },
        },
      },
      orderBy: [{ financeModel: { createdAt: 'desc' } }, { createdAt: 'asc' }],
    });
  }

  async listCategoryJarMappings(
    familyId: string,
    query: FinanceCategoryJarMappingQueryDto,
  ) {
    const model = query.financeModelId
      ? await this.prisma.financeModel.findFirst({
          where: { id: query.financeModelId, familyId },
        })
      : await this.prisma.financeModel.findFirst({
          where: { familyId, status: FinanceModelStatus.ACTIVE },
          orderBy: { updatedAt: 'desc' },
        });
    if (!model) {
      return { financeModel: null, items: [] };
    }

    const items = await this.prisma.financeCategoryJarMapping.findMany({
      where: { familyId, financeModelId: model.id },
      include: { category: true, jar: true, financeModel: true },
      orderBy: [
        { category: { categoryType: 'asc' } },
        { category: { name: 'asc' } },
      ],
    });
    return { financeModel: model, items };
  }

  upsertCategoryJarMapping(
    familyId: string,
    dto: UpsertFinanceCategoryJarMappingDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const model = await tx.financeModel.findFirst({
        where: { id: dto.financeModelId, familyId },
      });
      if (!model) {
        throw new NotFoundException(
          'Không tìm thấy mô hình tài chính trong gia đình này',
        );
      }
      const category = await tx.financeCategory.findFirst({
        where: {
          id: dto.categoryId,
          familyId,
          status: FinanceCategoryStatus.ACTIVE,
        },
      });
      if (!category) {
        throw new NotFoundException(
          'Không tìm thấy danh mục tài chính đang hoạt động trong gia đình này',
        );
      }
      const jar = await tx.financeJar.findFirst({
        where: {
          id: dto.jarId,
          financeModelId: model.id,
          financeModel: { familyId },
          isActive: true,
        },
      });
      if (!jar) {
        throw new NotFoundException(
          'Không tìm thấy hũ tài chính đang hoạt động trong mô hình này',
        );
      }

      return tx.financeCategoryJarMapping.upsert({
        where: {
          financeModelId_categoryId: {
            financeModelId: model.id,
            categoryId: category.id,
          },
        },
        create: {
          familyId,
          financeModelId: model.id,
          categoryId: category.id,
          jarId: jar.id,
        },
        update: { jarId: jar.id },
        include: { category: true, jar: true, financeModel: true },
      });
    });
  }

  async deleteCategoryJarMapping(familyId: string, mappingId: string) {
    const mapping = await this.prisma.financeCategoryJarMapping.findFirst({
      where: { id: mappingId, familyId },
    });
    if (!mapping) {
      throw new NotFoundException(
        'Không tìm thấy mapping danh mục - hũ trong gia đình này',
      );
    }
    return this.prisma.financeCategoryJarMapping.delete({
      where: { id: mapping.id },
    });
  }

  createFinanceJar(familyId: string, dto: CreateFinanceJarDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const model = await this.requireFamilyFinanceModel(
          tx,
          familyId,
          dto.financeModelId,
        );
        this.assertDraftFinanceModel(model.status);

        const isActive = dto.isActive ?? true;
        if (isActive) {
          await this.assertJarAllocationWithinLimit(
            tx,
            dto.financeModelId,
            new Prisma.Decimal(dto.allocationPercentage),
          );
        }

        try {
          return await tx.financeJar.create({
            data: {
              financeModelId: dto.financeModelId,
              name: dto.name.trim(),
              jarCode: dto.jarCode.trim().toUpperCase(),
              allocationPercentage: new Prisma.Decimal(
                dto.allocationPercentage,
              ),
              description: dto.description?.trim(),
              isActive,
            },
            include: { financeModel: true },
          });
        } catch (error) {
          if (this.isUniqueConstraintError(error)) {
            throw new ConflictException(
              'Mã hũ tài chính đã tồn tại trong mô hình này',
            );
          }
          throw error;
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  updateFinanceJar(familyId: string, jarId: string, dto: UpdateFinanceJarDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const jar = await tx.financeJar.findFirst({
          where: { id: jarId, financeModel: { familyId } },
          include: { financeModel: { select: { status: true } } },
        });
        if (!jar) {
          throw new NotFoundException(
            'Không tìm thấy hũ tài chính trong gia đình này',
          );
        }
        this.assertDraftFinanceModel(jar.financeModel.status);

        const isActive = dto.isActive ?? jar.isActive;
        const allocationPercentage =
          dto.allocationPercentage === undefined
            ? jar.allocationPercentage
            : new Prisma.Decimal(dto.allocationPercentage);
        if (isActive) {
          await this.assertJarAllocationWithinLimit(
            tx,
            jar.financeModelId,
            allocationPercentage,
            jar.id,
          );
        }

        try {
          return await tx.financeJar.update({
            where: { id: jar.id },
            data: {
              name: dto.name?.trim(),
              jarCode: dto.jarCode?.trim().toUpperCase(),
              allocationPercentage,
              description:
                dto.description === null ? null : dto.description?.trim(),
              isActive: dto.isActive,
            },
            include: { financeModel: true },
          });
        } catch (error) {
          if (this.isUniqueConstraintError(error)) {
            throw new ConflictException(
              'Mã hũ tài chính đã tồn tại trong mô hình này',
            );
          }
          throw error;
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  listCategories(familyId: string) {
    return this.prisma.financeCategory.findMany({
      where: { familyId },
      orderBy: [{ status: 'asc' }, { categoryType: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(familyId: string, dto: CreateFinanceCategoryDto) {
    const name = dto.name.trim();
    const duplicate = await this.prisma.financeCategory.findFirst({
      where: {
        familyId,
        name: { equals: name, mode: 'insensitive' },
        status: FinanceCategoryStatus.ACTIVE,
      },
    });
    if (duplicate) {
      throw new ConflictException(
        'Danh mục tài chính đang hoạt động với tên này đã tồn tại',
      );
    }

    try {
      return await this.prisma.financeCategory.create({
        data: {
          familyId,
          name,
          categoryType: dto.categoryType,
          essentialType: dto.essentialType ?? EssentialType.NEUTRAL,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Danh mục tài chính với tên và loại này đã tồn tại',
        );
      }
      throw error;
    }
  }

  async updateCategory(
    familyId: string,
    categoryId: string,
    dto: UpdateFinanceCategoryDto,
  ) {
    const category = await this.prisma.financeCategory.findFirst({
      where: { id: categoryId, familyId },
    });
    if (!category) {
      throw new NotFoundException(
        'KhÃ´ng tÃ¬m tháº¥y danh má»¥c tÃ i chÃ­nh trong gia Ä‘Ã¬nh nÃ y',
      );
    }

    const name = dto.name?.trim();
    const categoryType = dto.categoryType ?? category.categoryType;
    if (name || dto.categoryType) {
      const duplicate = await this.prisma.financeCategory.findFirst({
        where: {
          familyId,
          id: { not: category.id },
          name: { equals: name ?? category.name, mode: 'insensitive' },
          categoryType,
        },
      });
      if (duplicate) {
        throw new ConflictException(
          'Danh má»¥c tÃ i chÃ­nh vá»›i tÃªn vÃ  loáº¡i nÃ y Ä‘Ã£ tá»“n táº¡i',
        );
      }
    }

    try {
      return await this.prisma.financeCategory.update({
        where: { id: category.id },
        data: {
          name,
          categoryType: dto.categoryType,
          essentialType: dto.essentialType,
          status: dto.status,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Danh má»¥c tÃ i chÃ­nh vá»›i tÃªn vÃ  loáº¡i nÃ y Ä‘Ã£ tá»“n táº¡i',
        );
      }
      throw error;
    }
  }

  async deactivateCategory(familyId: string, categoryId: string) {
    const category = await this.prisma.financeCategory.findFirst({
      where: { id: categoryId, familyId },
    });
    if (!category) {
      throw new NotFoundException(
        'KhÃ´ng tÃ¬m tháº¥y danh má»¥c tÃ i chÃ­nh trong gia Ä‘Ã¬nh nÃ y',
      );
    }
    if (category.status === FinanceCategoryStatus.INACTIVE) {
      return category;
    }
    return this.prisma.financeCategory.update({
      where: { id: category.id },
      data: { status: FinanceCategoryStatus.INACTIVE },
    });
  }

  async listLedgerEntries(familyId: string, query: LedgerEntryQueryDto) {
    const ledger = await this.prisma.financeLedger.findUnique({
      where: { familyId },
      select: { id: true },
    });
    if (!ledger) {
      return buildPaginated([], 0, query.page, query.limit);
    }

    const entryDate =
      query.month !== undefined || query.year !== undefined
        ? this.periodRange(
            query.month ?? new Date().getUTCMonth() + 1,
            query.year ?? new Date().getUTCFullYear(),
          )
        : undefined;

    const where: Prisma.LedgerEntryWhereInput = {
      ledgerId: ledger.id,
      entryDate: entryDate
        ? { gte: entryDate.start, lt: entryDate.end }
        : undefined,
    };

    const [entries, total] = await this.prisma.$transaction([
      this.prisma.ledgerEntry.findMany({
        where,
        include: {
          category: true,
          jar: true,
          createdByMember: {
            select: {
              id: true,
              displayName: true,
              user: { select: { id: true, fullName: true, avatarUrl: true } },
            },
          },
        },
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        skip: skipFor(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);

    return buildPaginated(entries, total, query.page, query.limit);
  }

  async createLedgerEntry(
    familyId: string,
    memberId: string,
    dto: CreateLedgerEntryDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const ledger = await tx.financeLedger.upsert({
        where: { familyId },
        create: {
          familyId,
          ledgerName: 'Shared Family Ledger',
          status: FinanceLedgerStatus.ACTIVE,
        },
        update: {},
      });

      if (dto.categoryId) {
        const category = await tx.financeCategory.findFirst({
          where: {
            id: dto.categoryId,
            familyId,
            status: FinanceCategoryStatus.ACTIVE,
          },
        });
        if (!category) {
          throw new NotFoundException(
            'Không tìm thấy danh mục tài chính đang hoạt động trong gia đình này',
          );
        }
      }

      let jarId = dto.jarId;
      if (jarId) {
        await this.assertJarBelongsToFamily(tx, familyId, jarId);
      } else if (dto.categoryId) {
        jarId = await this.resolveMappedJarIdForActiveModel(
          tx,
          familyId,
          dto.categoryId,
        );
      }

      return tx.ledgerEntry.create({
        data: {
          ledgerId: ledger.id,
          categoryId: dto.categoryId,
          jarId,
          createdByMemberId: memberId,
          entryType: dto.entryType,
          amount: new Prisma.Decimal(dto.amount),
          description: dto.description.trim(),
          note: dto.note?.trim(),
          entryDate: new Date(dto.entryDate),
          sourceType: dto.sourceType?.trim(),
          sourceId: dto.sourceId?.trim(),
        },
        include: { category: true, jar: true },
      });
    });
  }

  async getLedgerEntry(familyId: string, entryId: string) {
    const entry = await this.prisma.ledgerEntry.findFirst({
      where: { id: entryId, ledger: { familyId } },
      include: {
        category: true,
        jar: true,
        createdByMember: {
          select: {
            id: true,
            displayName: true,
            user: { select: { id: true, fullName: true, avatarUrl: true } },
          },
        },
      },
    });
    if (!entry) {
      throw new NotFoundException(
        'KhÃ´ng tÃ¬m tháº¥y giao dá»‹ch trong sá»• tÃ i chÃ­nh gia Ä‘Ã¬nh nÃ y',
      );
    }
    return entry;
  }

  async updateLedgerEntry(
    familyId: string,
    entryId: string,
    dto: UpdateLedgerEntryDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await this.requireLedgerEntry(tx, familyId, entryId);
      if (entry.status !== LedgerEntryStatus.ACTIVE) {
        throw new BadRequestException(
          'KhÃ´ng thá»ƒ cáº­p nháº­t giao dá»‹ch Ä‘Ã£ bá»‹ há»§y',
        );
      }

      if (dto.categoryId) {
        const category = await tx.financeCategory.findFirst({
          where: {
            id: dto.categoryId,
            familyId,
            status: FinanceCategoryStatus.ACTIVE,
          },
        });
        if (!category) {
          throw new NotFoundException(
            'KhÃ´ng tÃ¬m tháº¥y danh má»¥c tÃ i chÃ­nh Ä‘ang hoáº¡t Ä‘á»™ng trong gia Ä‘Ã¬nh nÃ y',
          );
        }
      }

      let jarId: string | null | undefined = dto.jarId;
      if (jarId) {
        await this.assertJarBelongsToFamily(tx, familyId, jarId);
      } else if (dto.jarId === undefined && dto.categoryId !== undefined) {
        jarId = dto.categoryId
          ? await this.resolveMappedJarIdForActiveModel(
              tx,
              familyId,
              dto.categoryId,
            )
          : null;
      }

      return tx.ledgerEntry.update({
        where: { id: entry.id },
        data: {
          categoryId: dto.categoryId,
          jarId,
          entryType: dto.entryType,
          amount:
            dto.amount === undefined
              ? undefined
              : new Prisma.Decimal(dto.amount),
          description: dto.description?.trim(),
          note: dto.note === null ? null : dto.note?.trim(),
          entryDate:
            dto.entryDate === undefined ? undefined : new Date(dto.entryDate),
          sourceType: dto.sourceType === null ? null : dto.sourceType?.trim(),
          sourceId: dto.sourceId === null ? null : dto.sourceId?.trim(),
        },
        include: { category: true, jar: true },
      });
    });
  }

  async voidLedgerEntry(familyId: string, entryId: string) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await this.requireLedgerEntry(tx, familyId, entryId);
      if (entry.status === LedgerEntryStatus.VOIDED) {
        return entry;
      }
      return tx.ledgerEntry.update({
        where: { id: entry.id },
        data: { status: LedgerEntryStatus.VOIDED },
        include: { category: true, jar: true },
      });
    });
  }

  async getOverview(
    familyId: string,
    memberId: string,
    requestedPeriod: OptionalFinancePeriodDto,
  ) {
    const period = this.resolveOptionalPeriod(requestedPeriod);
    const { start, end } = this.periodRange(period.month, period.year);
    const ledger = await this.prisma.financeLedger.findUnique({
      where: { familyId },
      select: { id: true, ledgerName: true, status: true },
    });

    const monthlyFinancePromise = this.getMyMonthlyFinance(memberId, period);
    if (!ledger) {
      return {
        period,
        currency: 'VND',
        ledger: null,
        totalIncome: new Prisma.Decimal(0),
        totalExpense: new Prisma.Decimal(0),
        balance: new Prisma.Decimal(0),
        entryCount: 0,
        monthlyFinance: await monthlyFinancePromise,
      };
    }

    const baseWhere: Prisma.LedgerEntryWhereInput = {
      ledgerId: ledger.id,
      status: LedgerEntryStatus.ACTIVE,
      entryDate: { gte: start, lt: end },
    };

    const [income, expense, entryCount, monthlyFinance] = await Promise.all([
      this.prisma.ledgerEntry.aggregate({
        where: { ...baseWhere, entryType: LedgerEntryType.INCOME },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: {
          ...baseWhere,
          entryType: {
            in: [LedgerEntryType.EXPENSE, LedgerEntryType.SUPPORT],
          },
        },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.count({ where: baseWhere }),
      monthlyFinancePromise,
    ]);

    const totalIncome = income._sum.amount ?? new Prisma.Decimal(0);
    const totalExpense = expense._sum.amount ?? new Prisma.Decimal(0);

    return {
      period,
      currency: 'VND',
      ledger,
      totalIncome,
      totalExpense,
      balance: totalIncome.minus(totalExpense),
      entryCount,
      monthlyFinance,
    };
  }

  async listBudgetPlans(familyId: string, query: BudgetPlanQueryDto) {
    const where: Prisma.BudgetPlanWhereInput = {
      familyId,
      status: query.status,
      periodType: query.periodType,
    };
    const [plans, total] = await this.prisma.$transaction([
      this.prisma.budgetPlan.findMany({
        where,
        include: { _count: { select: { lines: true } } },
        orderBy: [{ createdAt: 'desc' }, { periodStart: 'desc' }],
        skip: skipFor(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.budgetPlan.count({ where }),
    ]);
    return buildPaginated(plans, total, query.page, query.limit);
  }

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

  createBudgetPlan(
    familyId: string,
    memberId: string,
    dto: CreateBudgetPlanDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireFamilyMember(tx, familyId, memberId);
      const periodStart = this.toDateOnly(dto.periodStart);
      const periodEnd = this.toDateOnly(dto.periodEnd);
      this.assertValidBudgetPeriod(periodStart, periodEnd);
      this.assertNonNegativeBudgetValues(dto);

      for (const line of dto.lines ?? []) {
        await this.validateBudgetLineInput(tx, familyId, line);
      }

      return tx.budgetPlan.create({
        data: {
          familyId,
          createdByMemberId: memberId,
          planName: dto.planName.trim(),
          periodType: dto.periodType,
          periodStart,
          periodEnd,
          expectedSharedIncome: this.optionalDecimal(dto.expectedSharedIncome),
          expectedSharedExpense: this.optionalDecimal(
            dto.expectedSharedExpense,
          ),
          lines: dto.lines?.length
            ? {
                create: dto.lines.map((line) =>
                  this.budgetLineCreateData(line),
                ),
              }
            : undefined,
        },
        include: {
          lines: { include: { category: true, jar: true } },
        },
      });
    });
  }

  updateBudgetPlan(
    familyId: string,
    budgetPlanId: string,
    dto: UpdateBudgetPlanDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await this.requireBudgetPlan(tx, familyId, budgetPlanId);
      this.assertDraftBudgetPlan(plan.status);

      const periodStart = dto.periodStart
        ? this.toDateOnly(dto.periodStart)
        : plan.periodStart;
      const periodEnd = dto.periodEnd
        ? this.toDateOnly(dto.periodEnd)
        : plan.periodEnd;
      this.assertValidBudgetPeriod(periodStart, periodEnd);
      this.assertNonNegativeBudgetValues(dto);

      return tx.budgetPlan.update({
        where: { id: plan.id },
        data: {
          planName: dto.planName?.trim(),
          periodType: dto.periodType,
          periodStart: dto.periodStart ? periodStart : undefined,
          periodEnd: dto.periodEnd ? periodEnd : undefined,
          expectedSharedIncome: this.nullableDecimal(dto.expectedSharedIncome),
          expectedSharedExpense: this.nullableDecimal(
            dto.expectedSharedExpense,
          ),
        },
        include: {
          lines: { include: { category: true, jar: true } },
        },
      });
    });
  }

  async activateBudgetPlan(familyId: string, budgetPlanId: string) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const plan = await this.requireBudgetPlan(tx, familyId, budgetPlanId);
          if (plan.status !== BudgetPlanStatus.DRAFT) {
            throw new BadRequestException(
              'Chỉ có thể kích hoạt kế hoạch ngân sách đang ở trạng thái DRAFT',
            );
          }
          const lineCount = await tx.budgetLine.count({
            where: { budgetPlanId: plan.id },
          });
          if (lineCount === 0) {
            throw new BadRequestException(
              'Kế hoạch ngân sách phải có ít nhất một dòng trước khi kích hoạt',
            );
          }
          const duplicate = await tx.budgetPlan.findFirst({
            where: {
              familyId,
              id: { not: plan.id },
              status: BudgetPlanStatus.ACTIVE,
              periodStart: plan.periodStart,
              periodEnd: plan.periodEnd,
            },
          });
          if (duplicate) {
            throw new ConflictException(
              'Đã tồn tại kế hoạch ngân sách đang hoạt động cho cùng kỳ',
            );
          }
          return tx.budgetPlan.update({
            where: { id: plan.id },
            data: { status: BudgetPlanStatus.ACTIVE },
            include: { lines: true },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Đã tồn tại kế hoạch ngân sách đang hoạt động cho cùng kỳ',
        );
      }
      throw error;
    }
  }

  closeBudgetPlan(familyId: string, budgetPlanId: string) {
    return this.changeBudgetPlanStatus(
      familyId,
      budgetPlanId,
      [BudgetPlanStatus.ACTIVE],
      BudgetPlanStatus.CLOSED,
      'Chỉ có thể đóng kế hoạch ngân sách đang ở trạng thái ACTIVE',
    );
  }

  cancelBudgetPlan(familyId: string, budgetPlanId: string) {
    return this.changeBudgetPlanStatus(
      familyId,
      budgetPlanId,
      [BudgetPlanStatus.DRAFT, BudgetPlanStatus.ACTIVE],
      BudgetPlanStatus.CANCELED,
      'Chỉ có thể hủy kế hoạch ngân sách đang ở trạng thái DRAFT hoặc ACTIVE',
    );
  }

  createBudgetLine(
    familyId: string,
    budgetPlanId: string,
    dto: CreateBudgetLineDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await this.requireBudgetPlan(tx, familyId, budgetPlanId);
      this.assertDraftBudgetPlan(plan.status);
      await this.validateBudgetLineInput(tx, familyId, dto);
      return tx.budgetLine.create({
        data: { budgetPlanId: plan.id, ...this.budgetLineCreateData(dto) },
        include: { category: true, jar: true },
      });
    });
  }

  updateBudgetLine(
    familyId: string,
    budgetLineId: string,
    dto: UpdateBudgetLineDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const line = await this.requireBudgetLine(tx, familyId, budgetLineId);
      this.assertDraftBudgetPlan(line.budgetPlan.status);
      const categoryId =
        dto.categoryId === undefined ? line.categoryId : dto.categoryId;
      const jarId = dto.jarId === undefined ? line.jarId : dto.jarId;
      await this.validateBudgetLineInput(tx, familyId, {
        categoryId: categoryId ?? undefined,
        jarId: jarId ?? undefined,
        plannedAmount: dto.plannedAmount ?? line.plannedAmount.toNumber(),
        thresholdAmount:
          dto.thresholdAmount === undefined
            ? line.thresholdAmount?.toNumber()
            : (dto.thresholdAmount ?? undefined),
        thresholdPercent:
          dto.thresholdPercent === undefined
            ? line.thresholdPercent?.toNumber()
            : (dto.thresholdPercent ?? undefined),
      });

      return tx.budgetLine.update({
        where: { id: line.id },
        data: {
          categoryId: dto.categoryId,
          jarId: dto.jarId,
          plannedAmount:
            dto.plannedAmount === undefined
              ? undefined
              : new Prisma.Decimal(dto.plannedAmount),
          thresholdAmount: this.nullableDecimal(dto.thresholdAmount),
          thresholdPercent: this.nullableDecimal(dto.thresholdPercent),
          essentialType: dto.essentialType,
          note: dto.note === null ? null : dto.note?.trim(),
        },
        include: { category: true, jar: true },
      });
    });
  }

  deleteBudgetLine(familyId: string, budgetLineId: string) {
    return this.prisma.$transaction(async (tx) => {
      const line = await this.requireBudgetLine(tx, familyId, budgetLineId);
      this.assertDraftBudgetPlan(line.budgetPlan.status);
      await tx.budgetLine.delete({ where: { id: line.id } });
      return null;
    });
  }

  private resolveOptionalPeriod(period: OptionalFinancePeriodDto) {
    const now = new Date();
    return {
      month: period.month ?? now.getUTCMonth() + 1,
      year: period.year ?? now.getUTCFullYear(),
    };
  }

  private periodRange(month: number, year: number) {
    return {
      start: new Date(Date.UTC(year, month - 1, 1)),
      end: new Date(Date.UTC(year, month, 1)),
    };
  }

  private periodKey(month: number, year: number) {
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  private monthEndDate(month: number, year: number) {
    return new Date(Date.UTC(year, month, 0));
  }

  private async calculateAvailableFamilyFund(
    tx: Prisma.TransactionClient,
    ledgerId: string,
    month: number,
    year: number,
  ) {
    const { start, end } = this.periodRange(month, year);
    const entries = await tx.ledgerEntry.findMany({
      where: {
        ledgerId,
        status: LedgerEntryStatus.ACTIVE,
        entryDate: { gte: start, lt: end },
      },
      select: { entryType: true, amount: true, sourceType: true },
    });

    return entries.reduce((sum, entry) => {
      if (FAMILY_FUND_CASH_IN_TYPES.includes(entry.entryType as never)) {
        return sum.plus(entry.amount);
      }
      if (FAMILY_FUND_CASH_OUT_TYPES.includes(entry.entryType as never)) {
        return sum.minus(entry.amount);
      }
      if (
        entry.entryType === LedgerEntryType.ADJUSTMENT &&
        entry.sourceType !== MODEL_FUND_ALLOCATION_SOURCE &&
        entry.sourceType !== MONTHLY_SURPLUS_TO_GOAL_SOURCE
      ) {
        return sum.plus(entry.amount);
      }
      return sum;
    }, new Prisma.Decimal(0));
  }

  private buildFundAllocationSnapshot(input: {
    model: FundAllocationModelSummary;
    period: { month: number; year: number };
    sourceId: string;
    jar: {
      id: string;
      financeModelId: string;
      name: string;
      jarCode: string;
      allocationPercentage: number;
      description: string | null;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    };
    amount: Prisma.Decimal;
  }): FundAllocationSnapshot {
    return {
      model: input.model,
      period: input.period,
      sourceType: MODEL_FUND_ALLOCATION_SOURCE,
      sourceId: input.sourceId,
      jar: {
        ...input.jar,
        createdAt:
          input.jar.createdAt?.toISOString() ?? new Date().toISOString(),
        updatedAt:
          input.jar.updatedAt?.toISOString() ?? new Date().toISOString(),
      },
      amount: this.decimalToNumber(input.amount),
    };
  }

  private readFundAllocationSnapshot(
    entry: FundAllocationEntryRow,
  ): FundAllocationSnapshot | null {
    if (!entry.metadata || typeof entry.metadata !== 'object') return null;
    if (Array.isArray(entry.metadata)) return null;

    const raw = entry.metadata as Record<string, unknown>;
    const snapshot = raw.fundAllocationSnapshot;
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return null;
    }

    const candidate = snapshot as Partial<FundAllocationSnapshot>;
    if (
      !candidate.model ||
      !candidate.period ||
      !candidate.jar ||
      candidate.sourceType !== MODEL_FUND_ALLOCATION_SOURCE ||
      typeof candidate.sourceId !== 'string' ||
      typeof candidate.amount !== 'number'
    ) {
      return null;
    }

    return candidate as FundAllocationSnapshot;
  }

  private parseFundAllocationSourceId(sourceId: string) {
    const separatorIndex = sourceId.lastIndexOf(':');
    if (separatorIndex < 1) return null;

    const modelId = sourceId.slice(0, separatorIndex);
    const period = sourceId.slice(separatorIndex + 1);
    const match = /^(\d{4})-(\d{2})$/.exec(period);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;

    return { modelId, period: { month, year } };
  }

  private buildFundAllocationHistoryItem(
    sourceId: string,
    entries: FundAllocationEntryRow[],
  ) {
    const parsed = this.parseFundAllocationSourceId(sourceId);
    if (!parsed || entries.length === 0) return null;

    const firstSnapshot = entries
      .map((entry) => this.readFundAllocationSnapshot(entry))
      .find((snapshot): snapshot is FundAllocationSnapshot =>
        Boolean(snapshot),
      );
    const model = firstSnapshot?.model ??
      entries.find((entry) => entry.jar?.financeModel)?.jar?.financeModel ?? {
        id: parsed.modelId,
        name: null,
        modelType: null,
      };

    const createdAt = entries.reduce(
      (latest, entry) =>
        entry.createdAt.getTime() > latest.getTime() ? entry.createdAt : latest,
      entries[0].createdAt,
    );
    const newestEntry = [...entries].sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    )[0];
    const sortedEntries = [...entries].sort((left, right) => {
      const leftSnapshot = this.readFundAllocationSnapshot(left);
      const rightSnapshot = this.readFundAllocationSnapshot(right);
      const leftJarCreatedAt = leftSnapshot
        ? new Date(leftSnapshot.jar.createdAt).getTime()
        : (left.jar?.createdAt.getTime() ?? left.createdAt.getTime());
      const rightJarCreatedAt = rightSnapshot
        ? new Date(rightSnapshot.jar.createdAt).getTime()
        : (right.jar?.createdAt.getTime() ?? right.createdAt.getTime());
      return leftJarCreatedAt - rightJarCreatedAt;
    });
    const totalAmount = sortedEntries.reduce(
      (sum, entry) =>
        sum.plus(
          this.readFundAllocationSnapshot(entry)?.amount ?? entry.amount,
        ),
      new Prisma.Decimal(0),
    );
    const mappedEntries = sortedEntries
      .map((entry) => this.mapFundAllocationLedgerEntry(entry))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    return {
      model: {
        id: model.id,
        name: model.name,
        modelType: model.modelType,
      },
      period: parsed.period,
      totalAmount: this.decimalToNumber(totalAmount),
      createdAt,
      createdByMemberId: newestEntry.createdByMemberId,
      note: newestEntry.note,
      sourceType: MODEL_FUND_ALLOCATION_SOURCE,
      sourceId,
      items: sortedEntries.flatMap((entry) => {
        const snapshot = this.readFundAllocationSnapshot(entry);
        const jar = snapshot?.jar ?? entry.jar;
        return [
          {
            jarId: jar?.id ?? entry.jarId,
            jarName: jar?.name ?? null,
            jarCode: jar?.jarCode ?? null,
            allocationPercentage: snapshot
              ? snapshot.jar.allocationPercentage
              : entry.jar
                ? this.decimalToNumber(entry.jar.allocationPercentage)
                : null,
            amount: snapshot
              ? snapshot.amount
              : this.decimalToNumber(entry.amount),
            ledgerEntryId: entry.id,
          },
        ];
      }),
      entries: mappedEntries,
    };
  }

  private mapFundAllocationLedgerEntry(entry: FundAllocationEntryRow) {
    const snapshot = this.readFundAllocationSnapshot(entry);
    const jar = snapshot?.jar ?? entry.jar;

    return {
      id: entry.id,
      ledgerId: entry.ledgerId,
      categoryId: entry.categoryId,
      jarId: entry.jarId,
      createdByMemberId: entry.createdByMemberId,
      entryType: entry.entryType,
      amount: snapshot ? snapshot.amount : this.decimalToNumber(entry.amount),
      description: entry.description,
      note: entry.note,
      entryDate: entry.entryDate,
      status: entry.status,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      jar: jar
        ? {
            id: jar.id,
            financeModelId: jar.financeModelId,
            name: jar.name,
            jarCode: jar.jarCode,
            allocationPercentage: snapshot
              ? snapshot.jar.allocationPercentage
              : this.decimalToNumber(entry.jar!.allocationPercentage),
            description: jar.description,
            isActive: jar.isActive,
            createdAt: snapshot
              ? new Date(snapshot.jar.createdAt)
              : jar.createdAt,
            updatedAt: snapshot
              ? new Date(snapshot.jar.updatedAt)
              : jar.updatedAt,
          }
        : null,
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

  private dateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private decimalToNumber(value: Prisma.Decimal) {
    return value.toNumber();
  }

  private decimalToNumberOrNull(value?: Prisma.Decimal | null) {
    return value ? this.decimalToNumber(value) : null;
  }

  private assertCanViewMemberFinance(
    viewer: { id: string; familyRole: FamilyRole },
    targetMemberId: string,
  ) {
    if (
      viewer.id !== targetMemberId &&
      !this.isFinanceManager(viewer.familyRole)
    ) {
      throw new ForbiddenException(
        'Không có quyền xem thông tin tài chính của thành viên khác',
      );
    }
  }

  private buildMonthlyFinanceView(
    monthlyFinance: MemberMonthlyFinance | null,
    canViewPrivateFinance: boolean,
  ) {
    if (!monthlyFinance) return null;

    const canViewIncome =
      canViewPrivateFinance ||
      monthlyFinance.incomeVisibility === FinanceVisibility.FAMILY;
    const canViewExpense =
      canViewPrivateFinance ||
      monthlyFinance.expenseVisibility === FinanceVisibility.FAMILY;

    return {
      ...monthlyFinance,
      expectedIncome: canViewIncome ? monthlyFinance.expectedIncome : null,
      actualIncome: canViewIncome ? monthlyFinance.actualIncome : null,
      expectedPersonalExpense: canViewExpense
        ? monthlyFinance.expectedPersonalExpense
        : null,
      actualPersonalExpense: canViewExpense
        ? monthlyFinance.actualPersonalExpense
        : null,
      note: canViewPrivateFinance ? monthlyFinance.note : null,
    };
  }

  private buildMonthlyFinanceSummaryView(
    monthlyFinance: MemberMonthlyFinance | null,
    canViewPrivateFinance: boolean,
  ) {
    const view = this.buildMonthlyFinanceView(
      monthlyFinance,
      canViewPrivateFinance,
    );
    if (!view) return null;
    return {
      ...view,
      expectedIncome: this.decimalToNumberOrNull(view.expectedIncome),
      actualIncome: this.decimalToNumberOrNull(view.actualIncome),
      expectedPersonalExpense: this.decimalToNumberOrNull(
        view.expectedPersonalExpense,
      ),
      actualPersonalExpense: this.decimalToNumberOrNull(
        view.actualPersonalExpense,
      ),
      expectedSharedContribution: this.decimalToNumberOrNull(
        view.expectedSharedContribution,
      ),
      actualSharedContribution: this.decimalToNumberOrNull(
        view.actualSharedContribution,
      ),
    };
  }

  private memberDisplayName(member: {
    displayName: string | null;
    user?: { fullName: string | null } | null;
  }) {
    return member.displayName ?? member.user?.fullName ?? 'Member';
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

  private async resolveMappedJarIdForActiveModel(
    tx: Prisma.TransactionClient,
    familyId: string,
    categoryId: string,
  ) {
    const mapping = await tx.financeCategoryJarMapping.findFirst({
      where: {
        familyId,
        categoryId,
        financeModel: { status: FinanceModelStatus.ACTIVE },
        jar: { isActive: true },
      },
      select: { jarId: true },
      orderBy: { updatedAt: 'desc' },
    });
    return mapping?.jarId;
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

  private computeContributionPlanStatus(
    plannedAmount: Prisma.Decimal,
    actualAmount: Prisma.Decimal,
    dueDate: Date,
    currentStatus?: GoalContributionPlanStatus,
  ) {
    if (
      currentStatus === GoalContributionPlanStatus.PENDING_CONFIRMATION ||
      currentStatus === GoalContributionPlanStatus.REJECTED
    ) {
      return currentStatus;
    }
    if (actualAmount.greaterThanOrEqualTo(plannedAmount)) {
      return GoalContributionPlanStatus.PAID;
    }
    const today = this.toDateOnly(new Date().toISOString());
    if (dueDate.getTime() < today.getTime()) {
      return GoalContributionPlanStatus.MISSED;
    }
    if (actualAmount.greaterThan(0)) {
      return GoalContributionPlanStatus.PARTIAL;
    }
    return GoalContributionPlanStatus.PLANNED;
  }

  private async requireFamilyMember(
    tx: Prisma.TransactionClient,
    familyId: string,
    memberId: string,
  ) {
    const member = await tx.familyMember.findFirst({
      where: { id: memberId, familyId },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException(
        'Không tìm thấy thành viên thực hiện trong gia đình này',
      );
    }
    return member;
  }

  private async requireLedgerEntry(
    tx: Prisma.TransactionClient,
    familyId: string,
    entryId: string,
  ) {
    const entry = await tx.ledgerEntry.findFirst({
      where: { id: entryId, ledger: { familyId } },
    });
    if (!entry) {
      throw new NotFoundException(
        'KhÃ´ng tÃ¬m tháº¥y giao dá»‹ch trong sá»• tÃ i chÃ­nh gia Ä‘Ã¬nh nÃ y',
      );
    }
    return entry;
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

  private async requireBudgetLine(
    tx: Prisma.TransactionClient,
    familyId: string,
    budgetLineId: string,
  ) {
    const line = await tx.budgetLine.findFirst({
      where: { id: budgetLineId, budgetPlan: { familyId } },
      include: { budgetPlan: { select: { status: true } } },
    });
    if (!line) {
      throw new NotFoundException(
        'Không tìm thấy dòng ngân sách trong gia đình này',
      );
    }
    return line;
  }

  private async validateBudgetLineInput(
    tx: Prisma.TransactionClient,
    familyId: string,
    line: {
      categoryId?: string;
      jarId?: string;
      plannedAmount: number;
      thresholdAmount?: number;
      thresholdPercent?: number;
    },
  ) {
    if (!line.categoryId && !line.jarId) {
      throw new BadRequestException(
        'Dòng ngân sách phải có categoryId hoặc jarId',
      );
    }
    this.assertNonNegativeBudgetValues(line);
    if (
      line.thresholdPercent !== undefined &&
      (line.thresholdPercent < 0 || line.thresholdPercent > 100)
    ) {
      throw new BadRequestException('thresholdPercent phải nằm từ 0 đến 100');
    }
    if (line.categoryId) {
      const category = await tx.financeCategory.findFirst({
        where: { id: line.categoryId, familyId },
        select: { id: true },
      });
      if (!category) {
        throw new NotFoundException(
          'Không tìm thấy danh mục tài chính trong gia đình này',
        );
      }
    }
    if (line.jarId) {
      const jar = await tx.financeJar.findFirst({
        where: { id: line.jarId, financeModel: { familyId } },
        select: { id: true },
      });
      if (!jar) {
        throw new NotFoundException(
          'Không tìm thấy hũ tài chính trong gia đình này',
        );
      }
    }
  }

  private budgetLineCreateData(line: CreateBudgetLineDto) {
    return {
      categoryId: line.categoryId,
      jarId: line.jarId,
      plannedAmount: new Prisma.Decimal(line.plannedAmount),
      thresholdAmount: this.optionalDecimal(line.thresholdAmount),
      thresholdPercent: this.optionalDecimal(line.thresholdPercent),
      essentialType: line.essentialType,
      note: line.note?.trim(),
    };
  }

  private assertDraftBudgetPlan(status: BudgetPlanStatus) {
    if (status !== BudgetPlanStatus.DRAFT) {
      throw new BadRequestException(
        'Chỉ có thể chỉnh sửa kế hoạch ngân sách đang ở trạng thái DRAFT',
      );
    }
  }

  private assertValidBudgetPeriod(periodStart: Date, periodEnd: Date) {
    if (periodEnd.getTime() < periodStart.getTime()) {
      throw new BadRequestException(
        'Ngày kết thúc kỳ ngân sách phải lớn hơn hoặc bằng ngày bắt đầu',
      );
    }
  }

  private assertNonNegativeBudgetValues(values: {
    expectedSharedIncome?: number | null;
    expectedSharedExpense?: number | null;
    plannedAmount?: number;
    thresholdAmount?: number | null;
  }) {
    for (const key of [
      'expectedSharedIncome',
      'expectedSharedExpense',
      'plannedAmount',
      'thresholdAmount',
    ]) {
      const value = values[key as keyof typeof values];
      if (typeof value === 'number' && value < 0) {
        throw new BadRequestException(`${key} không được nhỏ hơn 0`);
      }
    }
  }

  private changeBudgetPlanStatus(
    familyId: string,
    budgetPlanId: string,
    allowedStatuses: BudgetPlanStatus[],
    status: BudgetPlanStatus,
    message: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await this.requireBudgetPlan(tx, familyId, budgetPlanId);
      if (!allowedStatuses.includes(plan.status)) {
        throw new BadRequestException(message);
      }
      return tx.budgetPlan.update({
        where: { id: plan.id },
        data: { status },
        include: { lines: true },
      });
    });
  }

  private optionalDecimal(value?: number) {
    return value === undefined ? undefined : new Prisma.Decimal(value);
  }

  private nullableDecimal(value?: number | null) {
    return value === undefined
      ? undefined
      : value === null
        ? null
        : new Prisma.Decimal(value);
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

  private async requireFamilyFinanceModel(
    tx: Prisma.TransactionClient,
    familyId: string,
    modelId: string,
  ) {
    const model = await tx.financeModel.findFirst({
      where: { id: modelId, familyId },
    });
    if (!model) {
      throw new NotFoundException(
        'Không tìm thấy mô hình tài chính trong gia đình này',
      );
    }
    return model;
  }

  private async createDefaultJars(
    tx: Prisma.TransactionClient,
    financeModelId: string,
    modelType: FinanceModelType,
  ) {
    const template = FINANCE_MODEL_TEMPLATES.find(
      (item) => item.modelType === modelType,
    );
    if (!template?.jars.length) {
      return;
    }
    await tx.financeJar.createMany({
      data: template.jars.map((jar) => ({ ...jar, financeModelId })),
      skipDuplicates: true,
    });
  }

  private assertDraftFinanceModel(status: FinanceModelStatus) {
    if (status !== FinanceModelStatus.DRAFT) {
      throw new BadRequestException(
        'Chỉ có thể chỉnh sửa hũ tài chính khi mô hình đang ở trạng thái DRAFT',
      );
    }
  }

  private async assertJarAllocationWithinLimit(
    tx: Prisma.TransactionClient,
    financeModelId: string,
    addedAllocation = new Prisma.Decimal(0),
    excludedJarId?: string,
  ) {
    const current = await tx.financeJar.aggregate({
      where: {
        financeModelId,
        isActive: true,
        id: excludedJarId ? { not: excludedJarId } : undefined,
      },
      _sum: { allocationPercentage: true },
    });
    const total = (
      current._sum.allocationPercentage ?? new Prisma.Decimal(0)
    ).plus(addedAllocation);
    if (total.greaterThan(100)) {
      throw new BadRequestException(
        'Tổng tỷ lệ phân bổ của các hũ hoạt động không được vượt quá 100%',
      );
    }
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private isRecordNotFoundError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    );
  }
}
