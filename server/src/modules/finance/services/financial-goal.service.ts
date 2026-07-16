import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FamilyRole,
  BudgetAlertSeverity,
  BudgetAlertStatus,
  BudgetAlertType,
  FinanceLedgerStatus,
  FinanceVisibility,
  FinancialGoalStatus,
  GoalContributionPlanStatus,
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
import { ConfirmGoalContributionPlanDto } from '../dto/confirm-goal-contribution-plan.dto';
import { CreateFinancialGoalDto } from '../dto/create-financial-goal.dto';
import { CreateGoalAllocationDto } from '../dto/create-goal-allocation.dto';
import { RequiredFinancePeriodDto } from '../dto/finance-period.dto';
import { FinancialGoalQueryDto } from '../dto/financial-goal-query.dto';
import { ReviewGoalContributionPlanDto } from '../dto/review-goal-contribution-plan.dto';
import { SubmitGoalContributionPlanDto } from '../dto/submit-goal-contribution-plan.dto';
import { UpdateFinancialGoalDto } from '../dto/update-financial-goal.dto';
import { UpdateGoalAllocationDto } from '../dto/update-goal-allocation.dto';

type FinancialGoalWithJar = Prisma.FinancialGoalGetPayload<{
  include: { relatedJar: true };
}>;

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

const GOAL_ELIGIBLE_ENTRY_TYPES = [
  LedgerEntryType.INCOME,
  LedgerEntryType.CONTRIBUTION,
  LedgerEntryType.ALLOWANCE,
  LedgerEntryType.REWARD,
] as const;

@Injectable()
export class FinancialGoalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

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
        throw new ConflictException(
          'KhÃ´ng thá»ƒ cáº­p nháº­t má»¥c tiÃªu Ä‘Ã£ bá»‹ há»§y',
        );
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
        throw new ConflictException('Má»¥c tiÃªu tÃ i chÃ­nh Ä‘Ã£ bá»‹ há»§y');
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

  getFinancialGoalProgress(familyId: string, memberId: string, goalId: string) {
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

        const reviewedAt = new Date();
        const claimed = await tx.goalContributionPlan.updateMany({
          where: {
            id: plan.id,
            familyId,
            goalId,
            status: GoalContributionPlanStatus.PENDING_CONFIRMATION,
            pendingAmount: { not: null },
          },
          data: {
            reviewedByMemberId: reviewerMemberId,
            reviewedAt,
            reviewNote: dto.note?.trim(),
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            'Káº¿ hoáº¡ch Ä‘Ã³ng gÃ³p Ä‘Ã£ Ä‘Æ°á»£c xá»­ lÃ½',
          );
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
            reviewedAt,
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
        const entry = dto.ledgerEntryId
          ? await this.requireFamilyLedgerEntry(tx, familyId, dto.ledgerEntryId)
          : await this.createGoalContributionLedgerEntry(
              tx,
              familyId,
              memberId,
              goal,
              dto.amount,
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
        'KhÃ´ng tÃ¬m tháº¥y thÃ nh viÃªn Ä‘ang hoáº¡t Ä‘á»™ng trong gia Ä‘Ã¬nh nÃ y',
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

  private assertCanManageGoal(familyRole: FamilyRole) {
    if (!this.isFinanceManager(familyRole)) {
      throw new ForbiddenException(
        'KhÃ´ng cÃ³ quyá»n quáº£n lÃ½ má»¥c tiÃªu tÃ i chÃ­nh gia Ä‘Ã¬nh',
      );
    }
  }

  private assertCanViewGoal(
    familyRole: FamilyRole,
    goal: FinancialGoalWithJar,
  ) {
    if (goal.relatedJarId && !this.isFinanceManager(familyRole)) {
      throw new ForbiddenException(
        'KhÃ´ng cÃ³ quyá»n xem má»¥c tiÃªu tÃ i chÃ­nh gáº¯n vá»›i hÅ© riÃªng',
      );
    }
  }

  private assertFinancialGoalValues(
    targetAmount: number,
    monthlyContributionTarget?: number | null,
  ) {
    if (targetAmount <= 0) {
      throw new BadRequestException('targetAmount pháº£i lá»›n hÆ¡n 0');
    }
    if (
      monthlyContributionTarget !== undefined &&
      monthlyContributionTarget !== null &&
      monthlyContributionTarget < 0
    ) {
      throw new BadRequestException(
        'monthlyContributionTarget khÃ´ng Ä‘Æ°á»£c nhá» hÆ¡n 0',
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
        'KhÃ´ng tÃ¬m tháº¥y hÅ© tÃ i chÃ­nh trong gia Ä‘Ã¬nh nÃ y',
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
        'KhÃ´ng tÃ¬m tháº¥y má»¥c tiÃªu tÃ i chÃ­nh trong gia Ä‘Ã¬nh nÃ y',
      );
    }
    return goal;
  }

  private memberDisplayName(member: {
    displayName: string | null;
    user?: { fullName: string | null } | null;
  }) {
    return member.displayName ?? member.user?.fullName ?? 'Member';
  }

  private decimalToNumber(value: Prisma.Decimal) {
    return value.toDecimalPlaces(2).toNumber();
  }

  private periodRange(month: number, year: number) {
    return {
      start: new Date(Date.UTC(year, month - 1, 1)),
      end: new Date(Date.UTC(year, month, 1)),
    };
  }

  private dateKey(date: Date) {
    return date.toISOString().slice(0, 10);
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

  private async createGoalContributionLedgerEntry(
    tx: Prisma.TransactionClient,
    familyId: string,
    memberId: string,
    goal: FinancialGoalWithJar,
    amount: number,
  ) {
    const ledger = await tx.financeLedger.upsert({
      where: { familyId },
      create: {
        familyId,
        ledgerName: 'Shared Family Ledger',
        status: FinanceLedgerStatus.ACTIVE,
      },
      update: {},
    });

    return tx.ledgerEntry.create({
      data: {
        ledgerId: ledger.id,
        jarId: goal.relatedJarId,
        createdByMemberId: memberId,
        entryType: LedgerEntryType.CONTRIBUTION,
        amount: new Prisma.Decimal(amount),
        description: `Goal contribution: ${goal.goalName}`,
        entryDate: new Date(),
        sourceType: 'GOAL_QUICK_CONTRIBUTION',
        sourceId: goal.id,
        status: LedgerEntryStatus.ACTIVE,
      },
    });
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

    await this.notificationsService.createForMembers(
      familyId,
      recipients.map((recipient) => recipient.id),
      {
        type: NotificationType.GENERAL,
        priority: NotificationPriority.HIGH,
        title: 'Quỹ mục tiêu còn thiếu đóng góp',
        body: `${goalName} tháng ${periodMonth}/${periodYear} còn thiếu ${totalShortageAmount}.`,
        referenceType: 'FINANCIAL_GOAL',
        referenceId: goalId,
      },
    );
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
}
