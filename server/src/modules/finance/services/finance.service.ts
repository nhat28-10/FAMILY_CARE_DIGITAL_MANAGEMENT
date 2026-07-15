import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BudgetAlertSeverity,
  BudgetAlertStatus,
  BudgetAlertType,
  BudgetPlanStatus,
  EssentialType,
  FinanceCategoryType,
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
  NotificationPriority,
  NotificationType,
  Prisma,
  SpendingSupportRequestStatus,
} from '@prisma/client';

import {
  buildPaginated,
  skipFor,
} from '../../../common/types/paginated-result';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { FINANCE_MODEL_TEMPLATES } from '../constants/finance-model-templates.constant';
import { BudgetAlertQueryDto } from '../dto/budget-alert-query.dto';
import { BudgetPlanQueryDto } from '../dto/budget-plan-query.dto';
import { CreateBudgetLineDto } from '../dto/create-budget-line.dto';
import { CreateBudgetPlanDto } from '../dto/create-budget-plan.dto';
import { CreateFinanceCategoryDto } from '../dto/create-finance-category.dto';
import { CreateFinanceJarDto } from '../dto/create-finance-jar.dto';
import { CreateFinanceModelDto } from '../dto/create-finance-model.dto';
import { CreateFinancialGoalDto } from '../dto/create-financial-goal.dto';
import { CreateGoalAllocationDto } from '../dto/create-goal-allocation.dto';
import { CreateLedgerEntryDto } from '../dto/create-ledger-entry.dto';
import { CreateMemberMonthlyFinanceDto } from '../dto/create-member-monthly-finance.dto';
import { CreateSpendingSupportRequestDto } from '../dto/create-spending-support-request.dto';
import { LedgerEntryQueryDto } from '../dto/ledger-entry-query.dto';
import { ConfirmGoalContributionPlanDto } from '../dto/confirm-goal-contribution-plan.dto';
import {
  OptionalFinancePeriodDto,
  RequiredFinancePeriodDto,
} from '../dto/finance-period.dto';
import { FinancialGoalQueryDto } from '../dto/financial-goal-query.dto';
import { FinanceReportQueryDto } from '../dto/finance-report-query.dto';
import { RecomputeBudgetAlertsDto } from '../dto/recompute-budget-alerts.dto';
import { ResolveBudgetAlertDto } from '../dto/resolve-budget-alert.dto';
import { ReviewGoalContributionPlanDto } from '../dto/review-goal-contribution-plan.dto';
import {
  ReviewSpendingSupportRequestDto,
  SpendingSupportDecision,
} from '../dto/review-spending-support-request.dto';
import { SpendingSupportRequestQueryDto } from '../dto/spending-support-request-query.dto';
import { SubmitGoalContributionPlanDto } from '../dto/submit-goal-contribution-plan.dto';
import { UpdateBudgetLineDto } from '../dto/update-budget-line.dto';
import { UpdateBudgetPlanDto } from '../dto/update-budget-plan.dto';
import { UpdateFinancialGoalDto } from '../dto/update-financial-goal.dto';
import { UpdateMemberMonthlyFinanceDto } from '../dto/update-member-monthly-finance.dto';
import { UpdateFinanceJarDto } from '../dto/update-finance-jar.dto';
import { UpdateGoalAllocationDto } from '../dto/update-goal-allocation.dto';

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

type GoalContributionPlanRow = {
  contributionPlanId: string;
  memberId: string;
  displayName: string;
  plannedAmount: number;
  pendingAmount: number | null;
  actualAmount: number;
  shortageAmount: number;
  dueDate: string;
  submittedAt: Date | null;
  submittedNote: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  status: GoalContributionPlanStatus;
};

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

const GOAL_ELIGIBLE_ENTRY_TYPES = [
  LedgerEntryType.INCOME,
  LedgerEntryType.CONTRIBUTION,
  LedgerEntryType.ALLOWANCE,
  LedgerEntryType.REWARD,
] as const;

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

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

      if (dto.jarId) {
        await this.assertJarBelongsToFamily(tx, familyId, dto.jarId);
      }

      return tx.ledgerEntry.create({
        data: {
          ledgerId: ledger.id,
          categoryId: dto.categoryId,
          jarId: dto.jarId,
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

  async listSpendingSupportRequests(
    familyId: string,
    memberId: string,
    query: SpendingSupportRequestQueryDto,
  ) {
    const member = await this.getMemberInFamilyOrThrow(familyId, memberId);
    this.assertQueryPeriod(query.fromDate, query.toDate);
    const requesterMemberId = this.isFinanceManager(member.familyRole)
      ? query.mine
        ? memberId
        : query.requesterMemberId
      : memberId;
    const where: Prisma.SpendingSupportRequestWhereInput = {
      familyId,
      status: query.status,
      requesterMemberId,
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
    };
    const [requests, total] = await this.prisma.$transaction([
      this.prisma.spendingSupportRequest.findMany({
        where,
        include: this.spendingSupportRequestInclude(),
        orderBy: { createdAt: 'desc' },
        skip: skipFor(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.spendingSupportRequest.count({ where }),
    ]);
    return buildPaginated(requests, total, query.page, query.limit);
  }

  async getSpendingSupportRequest(
    familyId: string,
    memberId: string,
    requestId: string,
  ) {
    const member = await this.getMemberInFamilyOrThrow(familyId, memberId);
    const request = await this.requireSpendingSupportRequest(
      this.prisma,
      familyId,
      requestId,
    );
    this.assertCanViewSupportRequest(member, request);
    const ledgerEntry = await this.prisma.ledgerEntry.findFirst({
      where: {
        ledger: { familyId },
        sourceType: 'SUPPORT_REQUEST',
        sourceId: request.id,
      },
      include: { category: true },
    });
    return { ...request, ledgerEntry };
  }

  createSpendingSupportRequest(
    familyId: string,
    memberId: string,
    dto: CreateSpendingSupportRequestDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.getMemberInFamilyOrThrow(familyId, memberId, tx);
      const purpose = dto.purpose.trim();
      if (!purpose) {
        throw new BadRequestException(
          'Mục đích yêu cầu hỗ trợ chi tiêu là bắt buộc',
        );
      }
      if (dto.categoryId) {
        await this.assertSupportCategoryBelongsToFamily(
          tx,
          familyId,
          dto.categoryId,
        );
      }
      return tx.spendingSupportRequest.create({
        data: {
          familyId,
          requesterMemberId: memberId,
          amount: new Prisma.Decimal(dto.amount),
          categoryId: dto.categoryId,
          purpose,
        },
        include: this.spendingSupportRequestInclude(),
      });
    });
  }

  reviewSpendingSupportRequest(
    familyId: string,
    memberId: string,
    requestId: string,
    dto: ReviewSpendingSupportRequestDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const reviewer = await this.getMemberInFamilyOrThrow(
        familyId,
        memberId,
        tx,
      );
      const request = await this.requireSpendingSupportRequest(
        tx,
        familyId,
        requestId,
      );
      this.assertCanReviewSupportRequest(reviewer, request);
      if (request.status !== SpendingSupportRequestStatus.PENDING) {
        throw new ConflictException('Yêu cầu hỗ trợ chi tiêu đã được xử lý');
      }

      const reviewedAt = new Date();
      const status =
        dto.decision === SpendingSupportDecision.APPROVE
          ? SpendingSupportRequestStatus.APPROVED
          : SpendingSupportRequestStatus.REJECTED;
      const updated = await tx.spendingSupportRequest.updateMany({
        where: {
          id: request.id,
          familyId,
          status: SpendingSupportRequestStatus.PENDING,
        },
        data: {
          status,
          reviewedByMemberId: reviewer.id,
          reviewedAt,
          decisionNote: dto.decisionNote?.trim(),
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Yêu cầu hỗ trợ chi tiêu đã được xử lý');
      }

      let ledgerEntry: Prisma.LedgerEntryGetPayload<{
        include: { category: true };
      }> | null = null;
      if (dto.decision === SpendingSupportDecision.APPROVE) {
        const ledger = await tx.financeLedger.upsert({
          where: { familyId },
          create: {
            familyId,
            ledgerName: 'Shared Family Ledger',
            status: FinanceLedgerStatus.ACTIVE,
          },
          update: { status: FinanceLedgerStatus.ACTIVE },
        });
        ledgerEntry = await tx.ledgerEntry.create({
          data: {
            ledgerId: ledger.id,
            categoryId: request.categoryId,
            createdByMemberId: reviewer.id,
            entryType: LedgerEntryType.SUPPORT,
            amount: request.amount,
            description: `Hỗ trợ chi tiêu: ${request.purpose}`,
            note: dto.decisionNote?.trim(),
            entryDate: dto.occurredAt ? new Date(dto.occurredAt) : reviewedAt,
            status: LedgerEntryStatus.ACTIVE,
            sourceType: 'SUPPORT_REQUEST',
            sourceId: request.id,
          },
          include: { category: true },
        });
      }
      const reviewedRequest = await this.requireSpendingSupportRequest(
        tx,
        familyId,
        request.id,
      );
      return { ...reviewedRequest, ledgerEntry };
    });
  }

  cancelSpendingSupportRequest(
    familyId: string,
    memberId: string,
    requestId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const member = await this.getMemberInFamilyOrThrow(
        familyId,
        memberId,
        tx,
      );
      const request = await this.requireSpendingSupportRequest(
        tx,
        familyId,
        requestId,
      );
      if (request.requesterMemberId !== member.id) {
        throw new ForbiddenException(
          'Không có quyền hủy yêu cầu hỗ trợ chi tiêu này',
        );
      }
      if (request.status !== SpendingSupportRequestStatus.PENDING) {
        throw new ConflictException('Yêu cầu hỗ trợ chi tiêu đã được xử lý');
      }
      const updated = await tx.spendingSupportRequest.updateMany({
        where: {
          id: request.id,
          familyId,
          requesterMemberId: member.id,
          status: SpendingSupportRequestStatus.PENDING,
        },
        data: { status: SpendingSupportRequestStatus.CANCELED },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Yêu cầu hỗ trợ chi tiêu đã được xử lý');
      }
      return this.requireSpendingSupportRequest(tx, familyId, request.id);
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

  async listFinancialGoals(
    familyId: string,
    memberId: string,
    query: FinancialGoalQueryDto,
  ) {
    const member = await this.getMemberInFamilyOrThrow(familyId, memberId);
    const where: Prisma.FinancialGoalWhereInput = {
      familyId,
      status: query.status,
      relatedJarId: query.relatedJarId,
      // FinanceJar has no visibilityScope/owner yet. Jar-linked goals use the
      // safe fallback and are visible only to finance managers.
      relatedJar: this.isFinanceManager(member.familyRole)
        ? undefined
        : { is: null },
    };
    const [goals, total] = await this.prisma.$transaction([
      this.prisma.financialGoal.findMany({
        where,
        include: { relatedJar: true },
        orderBy: [{ createdAt: 'desc' }],
        skip: skipFor(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.financialGoal.count({ where }),
    ]);
    if (query.includeProgress) {
      const items = await Promise.all(
        goals.map((goal) => this.goalWithProgress(goal)),
      );
      return buildPaginated(items, total, query.page, query.limit);
    }
    return buildPaginated(goals, total, query.page, query.limit);
  }

  async getFinancialGoal(familyId: string, memberId: string, goalId: string) {
    const member = await this.getMemberInFamilyOrThrow(familyId, memberId);
    const goal = await this.requireFinancialGoal(familyId, goalId);
    this.assertCanViewGoal(member.familyRole, goal);
    return this.goalWithProgress(goal);
  }

  createFinancialGoal(
    familyId: string,
    memberId: string,
    dto: CreateFinancialGoalDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const member = await this.getMemberInFamilyOrThrow(
        familyId,
        memberId,
        tx,
      );
      this.assertCanManageGoal(member.familyRole);
      this.assertFinancialGoalValues(
        dto.targetAmount,
        dto.monthlyContributionTarget,
      );
      if (dto.relatedJarId) {
        await this.assertJarBelongsToFamily(tx, familyId, dto.relatedJarId);
      }
      const goal = await tx.financialGoal.create({
        data: {
          familyId,
          createdByMemberId: memberId,
          goalName: dto.goalName.trim(),
          targetAmount: new Prisma.Decimal(dto.targetAmount),
          deadline: dto.deadline ? this.toDateOnly(dto.deadline) : undefined,
          monthlyContributionTarget: this.optionalDecimal(
            dto.monthlyContributionTarget,
          ),
          relatedJarId: dto.relatedJarId,
        },
        include: { relatedJar: true },
      });
      const progress = this.buildGoalProgress(goal, new Prisma.Decimal(0));
      return { goal, progress };
    });
  }

  updateFinancialGoal(
    familyId: string,
    memberId: string,
    goalId: string,
    dto: UpdateFinancialGoalDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const member = await this.getMemberInFamilyOrThrow(
        familyId,
        memberId,
        tx,
      );
      this.assertCanManageGoal(member.familyRole);
      const goal = await this.requireFinancialGoal(familyId, goalId, tx);
      if (goal.status === FinancialGoalStatus.CANCELED) {
        throw new ConflictException('Không thể cập nhật mục tiêu đã bị hủy');
      }
      this.assertFinancialGoalValues(
        dto.targetAmount ?? goal.targetAmount.toNumber(),
        dto.monthlyContributionTarget === undefined
          ? goal.monthlyContributionTarget?.toNumber()
          : dto.monthlyContributionTarget,
      );
      if (dto.relatedJarId) {
        await this.assertJarBelongsToFamily(tx, familyId, dto.relatedJarId);
      }
      await tx.financialGoal.update({
        where: { id: goal.id },
        data: {
          goalName: dto.goalName?.trim(),
          targetAmount:
            dto.targetAmount === undefined
              ? undefined
              : new Prisma.Decimal(dto.targetAmount),
          deadline:
            dto.deadline === undefined
              ? undefined
              : dto.deadline === null
                ? null
                : this.toDateOnly(dto.deadline),
          monthlyContributionTarget: this.nullableDecimal(
            dto.monthlyContributionTarget,
          ),
          relatedJarId: dto.relatedJarId,
        },
      });
      return this.refreshGoalStatus(tx, goal.id);
    });
  }

  cancelFinancialGoal(familyId: string, memberId: string, goalId: string) {
    return this.prisma.$transaction(async (tx) => {
      const member = await this.getMemberInFamilyOrThrow(
        familyId,
        memberId,
        tx,
      );
      this.assertCanManageGoal(member.familyRole);
      const goal = await this.requireFinancialGoal(familyId, goalId, tx);
      if (goal.status === FinancialGoalStatus.CANCELED) {
        throw new ConflictException('Mục tiêu tài chính đã bị hủy');
      }
      const canceled = await tx.financialGoal.update({
        where: { id: goal.id },
        data: { status: FinancialGoalStatus.CANCELED },
        include: { relatedJar: true },
      });
      const current = await this.calculateGoalAllocatedAmount(tx, goal.id);
      return {
        goal: canceled,
        progress: this.buildGoalProgress(canceled, current),
      };
    });
  }

  async getFinancialGoalProgress(
    familyId: string,
    memberId: string,
    goalId: string,
  ) {
    return this.getFinancialGoal(familyId, memberId, goalId);
  }

  async getGoalContributionSuggestions(
    familyId: string,
    memberId: string,
    goalId: string,
    period: RequiredFinancePeriodDto,
  ) {
    const member = await this.getMemberInFamilyOrThrow(familyId, memberId);
    const goal = await this.requireFinancialGoal(familyId, goalId);
    this.assertCanViewGoal(member.familyRole, goal);

    const members = await this.prisma.familyMember.findMany({
      where: { familyId, status: MemberStatus.ACTIVE },
      select: {
        id: true,
        displayName: true,
        user: { select: { fullName: true } },
        monthlyFinances: {
          where: {
            periodMonth: period.month,
            periodYear: period.year,
          },
          select: {
            expectedIncome: true,
            expectedPersonalExpense: true,
            expectedSharedContribution: true,
            incomeVisibility: true,
            expenseVisibility: true,
          },
          take: 1,
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const suggestionsBase = members
      .map((familyMember) => {
        const monthlyFinance = familyMember.monthlyFinances[0];
        const canUseIncome =
          familyMember.id === memberId ||
          monthlyFinance?.incomeVisibility === FinanceVisibility.FAMILY;
        const canUseExpense =
          familyMember.id === memberId ||
          monthlyFinance?.expenseVisibility === FinanceVisibility.FAMILY;
        if (!monthlyFinance || !canUseIncome || !canUseExpense) {
          return null;
        }
        const expectedIncome =
          monthlyFinance.expectedIncome ?? new Prisma.Decimal(0);
        const expectedPersonalExpense =
          monthlyFinance.expectedPersonalExpense ?? new Prisma.Decimal(0);
        const expectedSharedContribution =
          monthlyFinance.expectedSharedContribution ?? new Prisma.Decimal(0);
        const availableAmount = Prisma.Decimal.max(
          expectedIncome
            .minus(expectedPersonalExpense)
            .minus(expectedSharedContribution),
          0,
        );
        return {
          memberId: familyMember.id,
          displayName: this.memberDisplayName(familyMember),
          availableAmount,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .filter((item) => item.availableAmount.greaterThan(0));

    const totalAvailableAmount = suggestionsBase.reduce(
      (sum, item) => sum.plus(item.availableAmount),
      new Prisma.Decimal(0),
    );
    const monthlyContributionTarget =
      goal.monthlyContributionTarget ?? new Prisma.Decimal(0);

    return {
      goalId,
      periodMonth: period.month,
      periodYear: period.year,
      monthlyContributionTarget: this.decimalToNumber(
        monthlyContributionTarget,
      ),
      totalAvailableAmount: this.decimalToNumber(totalAvailableAmount),
      suggestions: suggestionsBase.map((item) => ({
        memberId: item.memberId,
        displayName: item.displayName,
        availableAmount: this.decimalToNumber(item.availableAmount),
        suggestedContribution: totalAvailableAmount.equals(0)
          ? 0
          : this.decimalToNumber(
              monthlyContributionTarget
                .times(item.availableAmount)
                .dividedBy(totalAvailableAmount)
                .toDecimalPlaces(0),
            ),
      })),
    };
  }

  confirmGoalContributionPlans(
    familyId: string,
    memberId: string,
    goalId: string,
    dto: ConfirmGoalContributionPlanDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const member = await this.getMemberInFamilyOrThrow(
        familyId,
        memberId,
        tx,
      );
      this.assertCanManageGoal(member.familyRole);
      const goal = await this.requireFinancialGoal(familyId, goalId, tx);
      if (goal.status === FinancialGoalStatus.CANCELED) {
        throw new BadRequestException(
          'KhÃ´ng thá»ƒ xÃ¡c nháº­n káº¿ hoáº¡ch Ä‘Ã³ng gÃ³p cho má»¥c tiÃªu Ä‘Ã£ bá»‹ há»§y',
        );
      }

      const requestedMemberIds = dto.members.map((item) => item.memberId);
      if (new Set(requestedMemberIds).size !== requestedMemberIds.length) {
        throw new BadRequestException(
          'Danh sÃ¡ch thÃ nh viÃªn Ä‘Ã³ng gÃ³p khÃ´ng Ä‘Æ°á»£c trá»«ng láº·p',
        );
      }

      const activeMembers = await tx.familyMember.findMany({
        where: {
          id: { in: requestedMemberIds },
          familyId,
          status: MemberStatus.ACTIVE,
        },
        select: { id: true },
      });
      const activeMemberIds = new Set(activeMembers.map((item) => item.id));
      const invalidMemberIds = requestedMemberIds.filter(
        (id) => !activeMemberIds.has(id),
      );
      if (invalidMemberIds.length > 0) {
        throw new NotFoundException(
          'KhÃ´ng tÃ¬m tháº¥y thÃ nh viÃªn Ä‘ang hoáº¡t Ä‘á»™ng trong gia Ä‘Ã¬nh nÃ y',
        );
      }

      const dueDate = this.toDateOnly(dto.dueDate);
      const actualAmounts = await this.calculateGoalContributionActualAmounts(
        tx,
        familyId,
        goalId,
        dto.periodMonth,
        dto.periodYear,
        requestedMemberIds,
      );

      for (const planMember of dto.members) {
        const plannedAmount = new Prisma.Decimal(planMember.plannedAmount);
        const actualAmount =
          actualAmounts.get(planMember.memberId) ?? new Prisma.Decimal(0);
        const status = this.computeContributionPlanStatus(
          plannedAmount,
          actualAmount,
          dueDate,
        );
        await tx.goalContributionPlan.upsert({
          where: {
            goalId_memberId_periodMonth_periodYear: {
              goalId,
              memberId: planMember.memberId,
              periodMonth: dto.periodMonth,
              periodYear: dto.periodYear,
            },
          },
          create: {
            familyId,
            goalId,
            memberId: planMember.memberId,
            periodMonth: dto.periodMonth,
            periodYear: dto.periodYear,
            plannedAmount,
            dueDate,
            status,
          },
          update: {
            plannedAmount,
            dueDate,
            status,
          },
        });
      }

      return this.buildGoalContributionPlanView(
        tx,
        familyId,
        goal,
        dto.periodMonth,
        dto.periodYear,
      );
    });
  }

  submitGoalContributionPlan(
    familyId: string,
    memberId: string,
    goalId: string,
    planId: string,
    dto: SubmitGoalContributionPlanDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.getMemberInFamilyOrThrow(familyId, memberId, tx);
      const goal = await this.requireFinancialGoal(familyId, goalId, tx);
      const plan = await this.requireGoalContributionPlan(
        tx,
        familyId,
        goalId,
        planId,
      );
      if (plan.memberId !== memberId) {
        throw new ForbiddenException(
          'Không có quyền xác nhận kế hoạch đóng góp của thành viên khác',
        );
      }
      if (plan.status === GoalContributionPlanStatus.PAID) {
        throw new BadRequestException(
          'Kế hoạch đóng góp đã được thanh toán đủ',
        );
      }
      if (plan.status === GoalContributionPlanStatus.PENDING_CONFIRMATION) {
        throw new ConflictException('Kế hoạch đóng góp đang chờ xác nhận');
      }

      await tx.goalContributionPlan.update({
        where: { id: plan.id },
        data: {
          pendingAmount: new Prisma.Decimal(dto.amount),
          submittedAt: new Date(),
          submittedNote: dto.note?.trim(),
          reviewedByMemberId: null,
          reviewedAt: null,
          reviewNote: null,
          status: GoalContributionPlanStatus.PENDING_CONFIRMATION,
        },
      });

      return this.buildGoalContributionPlanView(
        tx,
        familyId,
        goal,
        plan.periodMonth,
        plan.periodYear,
      );
    });
  }

  approveGoalContributionPlan(
    familyId: string,
    reviewerMemberId: string,
    goalId: string,
    planId: string,
    dto: ReviewGoalContributionPlanDto,
  ) {
    return this.approveGoalContributionPlanAndNotify(
      familyId,
      reviewerMemberId,
      goalId,
      planId,
      dto,
    );
  }

  private async approveGoalContributionPlanAndNotify(
    familyId: string,
    reviewerMemberId: string,
    goalId: string,
    planId: string,
    dto: ReviewGoalContributionPlanDto,
  ) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const reviewer = await this.getMemberInFamilyOrThrow(
          familyId,
          reviewerMemberId,
          tx,
        );
        this.assertCanManageGoal(reviewer.familyRole);
        const goal = await this.requireFinancialGoal(familyId, goalId, tx);
        const plan = await this.requireGoalContributionPlan(
          tx,
          familyId,
          goalId,
          planId,
        );
        if (plan.status !== GoalContributionPlanStatus.PENDING_CONFIRMATION) {
          throw new BadRequestException(
            'Chi co the approve ke hoach dang cho xac nhan',
          );
        }
        if (!plan.pendingAmount || plan.pendingAmount.lessThanOrEqualTo(0)) {
          throw new BadRequestException('Không có số tiền đang chờ xác nhận');
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
        const ledgerEntry = await tx.ledgerEntry.create({
          data: {
            ledgerId: ledger.id,
            jarId: goal.relatedJarId,
            createdByMemberId: plan.memberId,
            entryType: LedgerEntryType.CONTRIBUTION,
            amount: plan.pendingAmount,
            description: `Goal contribution: ${goal.goalName}`,
            note: plan.submittedNote,
            entryDate: this.resolveContributionEntryDate(plan),
            sourceType: 'MANUAL',
            sourceId: plan.id,
            status: LedgerEntryStatus.ACTIVE,
          },
        });
        await tx.goalAllocation.create({
          data: {
            goalId: goal.id,
            ledgerEntryId: ledgerEntry.id,
            amount: plan.pendingAmount,
            allocatedByMemberId: reviewerMemberId,
          },
        });

        const actualAmounts = await this.calculateGoalContributionActualAmounts(
          tx,
          familyId,
          goal.id,
          plan.periodMonth,
          plan.periodYear,
          [plan.memberId],
        );
        const actualAmount =
          actualAmounts.get(plan.memberId) ?? new Prisma.Decimal(0);
        const status = this.computeContributionPlanStatus(
          plan.plannedAmount,
          actualAmount,
          plan.dueDate,
        );
        await tx.goalContributionPlan.update({
          where: { id: plan.id },
          data: {
            pendingAmount: null,
            reviewedByMemberId: reviewerMemberId,
            reviewedAt: new Date(),
            reviewNote: dto.note?.trim(),
            status,
          },
        });

        const view = await this.buildGoalContributionPlanView(
          tx,
          familyId,
          goal,
          plan.periodMonth,
          plan.periodYear,
        );
        return { view, goalName: goal.goalName };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.notifyContributionShortageAfterApproval(
      familyId,
      goalId,
      result.goalName,
      result.view.periodMonth,
      result.view.periodYear,
      result.view.totalShortageAmount,
    );

    return result.view;
  }

  rejectGoalContributionPlan(
    familyId: string,
    reviewerMemberId: string,
    goalId: string,
    planId: string,
    dto: ReviewGoalContributionPlanDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const reviewer = await this.getMemberInFamilyOrThrow(
        familyId,
        reviewerMemberId,
        tx,
      );
      this.assertCanManageGoal(reviewer.familyRole);
      const goal = await this.requireFinancialGoal(familyId, goalId, tx);
      const plan = await this.requireGoalContributionPlan(
        tx,
        familyId,
        goalId,
        planId,
      );
      if (plan.status !== GoalContributionPlanStatus.PENDING_CONFIRMATION) {
        throw new BadRequestException(
          'Chi co the reject ke hoach dang cho xac nhan',
        );
      }
      await tx.goalContributionPlan.update({
        where: { id: plan.id },
        data: {
          reviewedByMemberId: reviewerMemberId,
          reviewedAt: new Date(),
          reviewNote: dto.note?.trim(),
          status: GoalContributionPlanStatus.REJECTED,
        },
      });

      return this.buildGoalContributionPlanView(
        tx,
        familyId,
        goal,
        plan.periodMonth,
        plan.periodYear,
      );
    });
  }

  listGoalContributionPlans(
    familyId: string,
    memberId: string,
    goalId: string,
    period: RequiredFinancePeriodDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const member = await this.getMemberInFamilyOrThrow(
        familyId,
        memberId,
        tx,
      );
      const goal = await this.requireFinancialGoal(familyId, goalId, tx);
      this.assertCanViewGoal(member.familyRole, goal);
      return this.buildGoalContributionPlanView(
        tx,
        familyId,
        goal,
        period.month,
        period.year,
      );
    });
  }

  async getGoalContributionShortage(
    familyId: string,
    memberId: string,
    goalId: string,
    period: RequiredFinancePeriodDto,
  ) {
    const view = await this.listGoalContributionPlans(
      familyId,
      memberId,
      goalId,
      period,
    );
    return {
      goalId: view.goalId,
      periodMonth: view.periodMonth,
      periodYear: view.periodYear,
      totalPlannedAmount: view.totalPlannedAmount,
      totalActualAmount: view.totalActualAmount,
      totalShortageAmount: view.totalShortageAmount,
      memberShortages: view.members.filter((item) => item.shortageAmount > 0),
    };
  }

  async listGoalAllocations(
    familyId: string,
    memberId: string,
    goalId: string,
  ) {
    const member = await this.getMemberInFamilyOrThrow(familyId, memberId);
    const goal = await this.requireFinancialGoal(familyId, goalId);
    this.assertCanViewGoal(member.familyRole, goal);
    return this.prisma.goalAllocation.findMany({
      where: { goalId },
      include: {
        ledgerEntry: { include: { category: true } },
        allocatedByMember: {
          select: { id: true, displayName: true },
        },
      },
      orderBy: { allocatedAt: 'desc' },
    });
  }

  createGoalAllocation(
    familyId: string,
    memberId: string,
    goalId: string,
    dto: CreateGoalAllocationDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const member = await this.getMemberInFamilyOrThrow(
          familyId,
          memberId,
          tx,
        );
        const goal = await this.requireFinancialGoal(familyId, goalId, tx);
        if (goal.status === FinancialGoalStatus.CANCELED) {
          throw new BadRequestException(
            'Không thể phân bổ vào mục tiêu đã bị hủy',
          );
        }
        if (goal.status === FinancialGoalStatus.ACHIEVED) {
          throw new ConflictException('Mục tiêu tài chính đã hoàn thành');
        }
        const entry = await this.requireFamilyLedgerEntry(
          tx,
          familyId,
          dto.ledgerEntryId,
        );
        this.assertCanAllocateToGoal(member.familyRole, memberId, goal, entry);
        await this.assertAllocationAmountAvailable(
          tx,
          entry.id,
          entry.amount,
          dto.amount,
        );
        const allocation = await tx.goalAllocation.create({
          data: {
            goalId,
            ledgerEntryId: entry.id,
            amount: new Prisma.Decimal(dto.amount),
            allocatedByMemberId: memberId,
          },
          include: { ledgerEntry: true },
        });
        return {
          allocation,
          ...(await this.refreshGoalStatus(tx, goal.id)),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  updateGoalAllocation(
    familyId: string,
    memberId: string,
    allocationId: string,
    dto: UpdateGoalAllocationDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const member = await this.getMemberInFamilyOrThrow(
          familyId,
          memberId,
          tx,
        );
        const allocation = await this.requireGoalAllocation(
          tx,
          familyId,
          allocationId,
        );
        this.assertGoalAllowsAllocationChanges(allocation.goal.status);
        this.assertCanViewGoal(member.familyRole, allocation.goal);
        this.assertCanManageAllocation(
          member.familyRole,
          memberId,
          allocation.allocatedByMemberId,
        );
        await this.assertAllocationAmountAvailable(
          tx,
          allocation.ledgerEntryId,
          allocation.ledgerEntry.amount,
          dto.amount,
          allocation.id,
        );
        const updated = await tx.goalAllocation.update({
          where: { id: allocation.id },
          data: { amount: new Prisma.Decimal(dto.amount) },
          include: { ledgerEntry: true },
        });
        return {
          allocation: updated,
          ...(await this.refreshGoalStatus(tx, allocation.goalId)),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  deleteGoalAllocation(
    familyId: string,
    memberId: string,
    allocationId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const member = await this.getMemberInFamilyOrThrow(
          familyId,
          memberId,
          tx,
        );
        const allocation = await this.requireGoalAllocation(
          tx,
          familyId,
          allocationId,
        );
        this.assertGoalAllowsAllocationChanges(allocation.goal.status);
        this.assertCanViewGoal(member.familyRole, allocation.goal);
        this.assertCanManageAllocation(
          member.familyRole,
          memberId,
          allocation.allocatedByMemberId,
        );
        await tx.goalAllocation.delete({ where: { id: allocation.id } });
        return this.refreshGoalStatus(tx, allocation.goalId);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

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

  recomputeBudgetGoalAlerts(
    familyId: string,
    memberId: string,
    dto: RecomputeBudgetAlertsDto,
  ) {
    return this.prisma.$transaction(
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
        return this.syncAlertCandidates(tx, familyId, candidates, {
          ...dto,
          periodStart: this.dateKey(period.start),
          periodEnd: this.dateKey(period.end),
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
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
            message: `Chi tiêu ${line.category?.name ?? line.jar?.name ?? line.id} đã vượt ngân sách ${percent.toString()}% trong kỳ này.`,
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

  private async syncAlertCandidates(
    tx: Prisma.TransactionClient,
    familyId: string,
    candidates: AlertCandidate[],
    dto: RecomputeBudgetAlertsDto,
  ) {
    const activeKeys = candidates.map((candidate) => candidate.sourceKey);
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
        await tx.budgetAlert.create({
          data: {
            familyId,
            sourceKey: candidate.sourceKey,
            alertType: candidate.alertType,
            ...data,
          },
        });
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

  private spendingSupportRequestInclude() {
    return {
      requesterMember: {
        select: {
          id: true,
          displayName: true,
          user: { select: { id: true, fullName: true, avatarUrl: true } },
        },
      },
      reviewedByMember: {
        select: {
          id: true,
          displayName: true,
          user: { select: { id: true, fullName: true, avatarUrl: true } },
        },
      },
      category: true,
    } satisfies Prisma.SpendingSupportRequestInclude;
  }

  private async requireSpendingSupportRequest(
    client: Prisma.TransactionClient | PrismaService,
    familyId: string,
    requestId: string,
  ) {
    const request = await client.spendingSupportRequest.findFirst({
      where: { id: requestId, familyId },
      include: this.spendingSupportRequestInclude(),
    });
    if (!request) {
      throw new NotFoundException(
        'Không tìm thấy yêu cầu hỗ trợ chi tiêu trong gia đình này',
      );
    }
    return request;
  }

  private assertCanViewSupportRequest(
    member: { id: string; familyRole: FamilyRole },
    request: { requesterMemberId: string },
  ) {
    if (
      !this.isFinanceManager(member.familyRole) &&
      request.requesterMemberId !== member.id
    ) {
      throw new ForbiddenException(
        'Không có quyền xem yêu cầu hỗ trợ chi tiêu này',
      );
    }
  }

  private assertCanReviewSupportRequest(
    member: { id: string; familyRole: FamilyRole },
    request: { requesterMemberId: string },
  ) {
    if (!this.isFinanceManager(member.familyRole)) {
      throw new ForbiddenException(
        'Không có quyền duyệt yêu cầu hỗ trợ chi tiêu',
      );
    }
    if (request.requesterMemberId === member.id) {
      throw new BadRequestException(
        'Không thể tự duyệt yêu cầu hỗ trợ chi tiêu của chính mình',
      );
    }
  }

  private async assertSupportCategoryBelongsToFamily(
    client: Prisma.TransactionClient | PrismaService,
    familyId: string,
    categoryId: string,
  ) {
    const category = await client.financeCategory.findFirst({
      where: { id: categoryId, familyId, status: FinanceCategoryStatus.ACTIVE },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException(
        'Không tìm thấy danh mục tài chính đang hoạt động trong gia đình này',
      );
    }
  }

  private assertCanManageGoal(familyRole: FamilyRole) {
    if (!this.isFinanceManager(familyRole)) {
      throw new ForbiddenException(
        'Không có quyền quản lý mục tiêu tài chính gia đình',
      );
    }
  }

  private assertCanViewGoal(
    familyRole: FamilyRole,
    goal: FinancialGoalWithJar,
  ) {
    if (goal.relatedJarId && !this.isFinanceManager(familyRole)) {
      throw new ForbiddenException(
        'Không có quyền xem mục tiêu tài chính gắn với hũ riêng',
      );
    }
  }

  private assertCanAllocateToGoal(
    familyRole: FamilyRole,
    memberId: string,
    goal: FinancialGoalWithJar,
    ledgerEntry: {
      createdByMemberId: string;
      status: LedgerEntryStatus;
      entryType: LedgerEntryType;
    },
  ) {
    this.assertCanViewGoal(familyRole, goal);
    if (ledgerEntry.status !== LedgerEntryStatus.ACTIVE) {
      throw new BadRequestException(
        'Chỉ có thể phân bổ giao dịch sổ cái đang hoạt động',
      );
    }
    if (!GOAL_ELIGIBLE_ENTRY_TYPES.includes(ledgerEntry.entryType as never)) {
      throw new BadRequestException(
        'Loại giao dịch sổ cái không đủ điều kiện phân bổ vào mục tiêu',
      );
    }
    if (
      !this.isFinanceManager(familyRole) &&
      ledgerEntry.createdByMemberId !== memberId
    ) {
      throw new ForbiddenException(
        'Không có quyền phân bổ giao dịch do thành viên khác ghi nhận',
      );
    }
  }

  private assertCanManageAllocation(
    familyRole: FamilyRole,
    memberId: string,
    allocatedByMemberId: string,
  ) {
    if (
      !this.isFinanceManager(familyRole) &&
      allocatedByMemberId !== memberId
    ) {
      throw new ForbiddenException(
        'Không có quyền cập nhật hoặc xóa phân bổ này',
      );
    }
  }

  private assertGoalAllowsAllocationChanges(status: FinancialGoalStatus) {
    if (status === FinancialGoalStatus.CANCELED) {
      throw new BadRequestException(
        'Không thể thay đổi phân bổ của mục tiêu đã bị hủy',
      );
    }
  }

  private assertFinancialGoalValues(
    targetAmount: number,
    monthlyContributionTarget?: number | null,
  ) {
    if (targetAmount <= 0) {
      throw new BadRequestException('targetAmount phải lớn hơn 0');
    }
    if (
      monthlyContributionTarget !== undefined &&
      monthlyContributionTarget !== null &&
      monthlyContributionTarget < 0
    ) {
      throw new BadRequestException(
        'monthlyContributionTarget không được nhỏ hơn 0',
      );
    }
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

  private async requireFamilyLedgerEntry(
    tx: Prisma.TransactionClient,
    familyId: string,
    ledgerEntryId: string,
  ) {
    const entry = await tx.ledgerEntry.findFirst({
      where: { id: ledgerEntryId, ledger: { familyId } },
    });
    if (!entry) {
      throw new NotFoundException(
        'Không tìm thấy giao dịch sổ cái trong gia đình này',
      );
    }
    return entry;
  }

  private async requireGoalAllocation(
    tx: Prisma.TransactionClient,
    familyId: string,
    allocationId: string,
  ) {
    const allocation = await tx.goalAllocation.findFirst({
      where: { id: allocationId, goal: { familyId } },
      include: {
        goal: { include: { relatedJar: true } },
        ledgerEntry: { select: { amount: true } },
      },
    });
    if (!allocation) {
      throw new NotFoundException(
        'Không tìm thấy phân bổ mục tiêu trong gia đình này',
      );
    }
    return allocation;
  }

  private async requireGoalContributionPlan(
    tx: Prisma.TransactionClient,
    familyId: string,
    goalId: string,
    planId: string,
  ) {
    const plan = await tx.goalContributionPlan.findFirst({
      where: { id: planId, familyId, goalId },
    });
    if (!plan) {
      throw new NotFoundException(
        'Không tìm thấy kế hoạch đóng góp mục tiêu trong gia đình này',
      );
    }
    return plan;
  }

  private async buildGoalContributionPlanView(
    tx: Prisma.TransactionClient,
    familyId: string,
    goal: FinancialGoalWithJar,
    periodMonth: number,
    periodYear: number,
  ) {
    const plans = await tx.goalContributionPlan.findMany({
      where: {
        familyId,
        goalId: goal.id,
        periodMonth,
        periodYear,
      },
      include: {
        member: {
          select: {
            id: true,
            displayName: true,
            user: { select: { fullName: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    const actualAmounts = await this.calculateGoalContributionActualAmounts(
      tx,
      familyId,
      goal.id,
      periodMonth,
      periodYear,
      plans.map((plan) => plan.memberId),
    );

    const rows: GoalContributionPlanRow[] = [];
    for (const plan of plans) {
      const actualAmount =
        actualAmounts.get(plan.memberId) ?? new Prisma.Decimal(0);
      const status = this.computeContributionPlanStatus(
        plan.plannedAmount,
        actualAmount,
        plan.dueDate,
        plan.status,
      );
      if (status !== plan.status) {
        await tx.goalContributionPlan.update({
          where: { id: plan.id },
          data: { status },
        });
      }
      const shortageAmount = Prisma.Decimal.max(
        plan.plannedAmount.minus(actualAmount),
        new Prisma.Decimal(0),
      );
      rows.push({
        contributionPlanId: plan.id,
        memberId: plan.memberId,
        displayName: this.memberDisplayName(plan.member),
        plannedAmount: this.decimalToNumber(plan.plannedAmount),
        pendingAmount: plan.pendingAmount
          ? this.decimalToNumber(plan.pendingAmount)
          : null,
        actualAmount: this.decimalToNumber(actualAmount),
        shortageAmount: this.decimalToNumber(shortageAmount),
        dueDate: this.dateKey(plan.dueDate),
        submittedAt: plan.submittedAt,
        submittedNote: plan.submittedNote,
        reviewedAt: plan.reviewedAt,
        reviewNote: plan.reviewNote,
        status,
      });
    }

    await this.syncGoalContributionShortageAlerts(
      tx,
      familyId,
      goal,
      periodMonth,
      periodYear,
      rows,
    );

    const totalPlannedAmount = rows.reduce(
      (sum, item) => sum + item.plannedAmount,
      0,
    );
    const totalActualAmount = rows.reduce(
      (sum, item) => sum + item.actualAmount,
      0,
    );
    const totalShortageAmount = rows.reduce(
      (sum, item) => sum + item.shortageAmount,
      0,
    );
    return {
      goalId: goal.id,
      periodMonth,
      periodYear,
      totalPlannedAmount,
      totalActualAmount,
      totalShortageAmount,
      members: rows,
    };
  }

  private async calculateGoalContributionActualAmounts(
    client: Prisma.TransactionClient | PrismaService,
    familyId: string,
    goalId: string,
    periodMonth: number,
    periodYear: number,
    memberIds?: string[],
  ) {
    if (memberIds && memberIds.length === 0) {
      return new Map<string, Prisma.Decimal>();
    }
    const { start, end } = this.periodRange(periodMonth, periodYear);
    const allocations = await client.goalAllocation.findMany({
      where: {
        goalId,
        ledgerEntry: {
          ledger: { familyId },
          entryType: LedgerEntryType.CONTRIBUTION,
          status: LedgerEntryStatus.ACTIVE,
          createdByMemberId: memberIds ? { in: memberIds } : undefined,
          entryDate: { gte: start, lt: end },
        },
      },
      select: {
        amount: true,
        ledgerEntry: { select: { createdByMemberId: true } },
      },
    });
    const actualAmounts = new Map<string, Prisma.Decimal>();
    for (const allocation of allocations) {
      const contributorId = allocation.ledgerEntry.createdByMemberId;
      actualAmounts.set(
        contributorId,
        (actualAmounts.get(contributorId) ?? new Prisma.Decimal(0)).plus(
          allocation.amount,
        ),
      );
    }
    return actualAmounts;
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

  private resolveContributionEntryDate(plan: {
    periodMonth: number;
    periodYear: number;
    submittedAt: Date | null;
    dueDate: Date;
  }) {
    const { start, end } = this.periodRange(plan.periodMonth, plan.periodYear);
    if (
      plan.submittedAt &&
      plan.submittedAt.getTime() >= start.getTime() &&
      plan.submittedAt.getTime() < end.getTime()
    ) {
      return plan.submittedAt;
    }
    return plan.dueDate;
  }

  private async syncGoalContributionShortageAlerts(
    tx: Prisma.TransactionClient,
    familyId: string,
    goal: FinancialGoalWithJar,
    periodMonth: number,
    periodYear: number,
    rows: GoalContributionPlanRow[],
  ) {
    const prefix = `CONTRIBUTION_SHORTAGE:${goal.id}:${periodMonth}:${periodYear}:`;
    const activeRows = rows.filter(
      (row) =>
        row.shortageAmount > 0 &&
        row.status === GoalContributionPlanStatus.MISSED,
    );
    const activeKeys = activeRows.map((row) => `${prefix}${row.memberId}`);
    for (const row of activeRows) {
      const sourceKey = `${prefix}${row.memberId}`;
      const data = {
        severity: this.contributionShortageSeverity(
          new Prisma.Decimal(row.plannedAmount),
          new Prisma.Decimal(row.shortageAmount),
        ),
        thresholdValue: new Prisma.Decimal(row.plannedAmount),
        actualValue: new Prisma.Decimal(row.actualAmount),
        goalId: goal.id,
        jarId: goal.relatedJarId ?? undefined,
        message: `Goal ${goal.goalName} contribution is short by ${row.shortageAmount} for ${row.displayName}.`,
      };
      const existing = await tx.budgetAlert.findFirst({
        where: {
          familyId,
          sourceKey,
          status: {
            in: [BudgetAlertStatus.NEW, BudgetAlertStatus.ACKNOWLEDGED],
          },
        },
      });
      if (existing) {
        await tx.budgetAlert.update({ where: { id: existing.id }, data });
      } else {
        await tx.budgetAlert.create({
          data: {
            familyId,
            sourceKey,
            alertType: BudgetAlertType.GOAL_AT_RISK,
            ...data,
          },
        });
      }
    }
    await tx.budgetAlert.updateMany({
      where: {
        familyId,
        alertType: BudgetAlertType.GOAL_AT_RISK,
        sourceKey: activeKeys.length
          ? { startsWith: prefix, notIn: activeKeys }
          : { startsWith: prefix },
        status: { in: [BudgetAlertStatus.NEW, BudgetAlertStatus.ACKNOWLEDGED] },
      },
      data: { status: BudgetAlertStatus.RESOLVED, resolvedAt: new Date() },
    });
  }

  private contributionShortageSeverity(
    plannedAmount: Prisma.Decimal,
    shortageAmount: Prisma.Decimal,
  ) {
    if (plannedAmount.equals(0)) return BudgetAlertSeverity.LOW;
    const percent = shortageAmount.dividedBy(plannedAmount).times(100);
    if (percent.lessThanOrEqualTo(10)) return BudgetAlertSeverity.LOW;
    if (percent.lessThanOrEqualTo(25)) return BudgetAlertSeverity.MEDIUM;
    return BudgetAlertSeverity.HIGH;
  }

  private async notifyContributionShortageAfterApproval(
    familyId: string,
    goalId: string,
    goalName: string,
    periodMonth: number,
    periodYear: number,
    totalShortageAmount: number,
  ) {
    if (totalShortageAmount <= 0) {
      return;
    }

    const recipients = await this.prisma.familyMember.findMany({
      where: {
        familyId,
        status: MemberStatus.ACTIVE,
        familyRole: {
          in: [FamilyRole.FAMILY_MANAGER, FamilyRole.DEPUTY_MEMBER],
        },
      },
      select: { id: true },
    });

    await this.notificationsService.notify(
      familyId,
      recipients.map((recipient) => recipient.id),
      {
        type: NotificationType.FINANCE,
        priority: NotificationPriority.HIGH,
        title: 'Quỹ mục tiêu còn thiếu đóng góp',
        body: `${goalName} tháng ${periodMonth}/${periodYear} còn thiếu ${totalShortageAmount}.`,
        referenceType: 'FINANCIAL_GOAL',
        referenceId: goalId,
      },
    );
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

  private async calculateLedgerEntryAllocatedAmount(
    tx: Prisma.TransactionClient,
    ledgerEntryId: string,
    excludeAllocationId?: string,
  ) {
    const result = await tx.goalAllocation.aggregate({
      where: {
        ledgerEntryId,
        id: excludeAllocationId ? { not: excludeAllocationId } : undefined,
      },
      _sum: { amount: true },
    });
    return result._sum.amount ?? new Prisma.Decimal(0);
  }

  private async assertAllocationAmountAvailable(
    tx: Prisma.TransactionClient,
    ledgerEntryId: string,
    ledgerEntryAmount: Prisma.Decimal,
    requestedAmount: number,
    excludeAllocationId?: string,
  ) {
    if (requestedAmount <= 0) {
      throw new BadRequestException('Số tiền phân bổ phải lớn hơn 0');
    }
    const allocated = await this.calculateLedgerEntryAllocatedAmount(
      tx,
      ledgerEntryId,
      excludeAllocationId,
    );
    const remaining = ledgerEntryAmount.minus(allocated);
    if (new Prisma.Decimal(requestedAmount).greaterThan(remaining)) {
      throw new BadRequestException(
        'Số tiền phân bổ vượt quá số tiền còn có thể phân bổ của giao dịch',
      );
    }
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

  private async refreshGoalStatus(
    tx: Prisma.TransactionClient,
    goalId: string,
  ) {
    const goal = await tx.financialGoal.findUniqueOrThrow({
      where: { id: goalId },
      include: { relatedJar: true },
    });
    const current = await this.calculateGoalAllocatedAmount(tx, goalId);
    const progress = this.buildGoalProgress(goal, current);
    const status = this.computedGoalStatus(goal.status, progress);
    const updated =
      status === goal.status
        ? goal
        : await tx.financialGoal.update({
            where: { id: goal.id },
            data: { status },
            include: { relatedJar: true },
          });
    return { goal: updated, progress };
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
