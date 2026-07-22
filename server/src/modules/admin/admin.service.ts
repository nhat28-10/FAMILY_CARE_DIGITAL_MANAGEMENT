import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  ActivationStatus,
  FamilySubscriptionStatus,
  Prisma,
  ProvisioningActionType,
  ProvisioningStatus,
  UserType,
  VerificationStatus,
  WorkspaceStatus,
} from '@prisma/client';
import type { User } from '@prisma/client';

import {
  buildPaginated,
  PaginatedResult,
  skipFor,
} from '../../common/types/paginated-result';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionLifecycleService } from '../billing/subscription-lifecycle.service';
import { FREE_PLAN_CODE } from '../subscription-plans/subscription-plans.constants';
import { sanitizeUser, SafeUser } from '../users/users.types';
import { AdminUpdateFamilyDto } from './dto/update-family.dto';
import { AdminUpdateMemberDto } from './dto/update-member.dto';
import { AdminUpdateUserDto } from './dto/update-user.dto';
import {
  AdminPaymentQueryDto,
  AdminPaymentStatus,
} from './dto/admin-payment-query.dto';
import { AdminRevenueMonthlyQueryDto } from './dto/admin-revenue-monthly-query.dto';
import { ListFamiliesQueryDto } from './dto/list-families-query.dto';
import { ListMembersQueryDto } from './dto/list-members-query.dto';
import { ListProvisioningLogsQueryDto } from './dto/list-provisioning-logs-query.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { ListJoinRequestsQueryDto } from './dto/list-join-requests-query.dto';
import { ManualRenewSubscriptionDto } from './dto/manual-renew-subscription.dto';
import { RetryProvisioningDto } from './dto/retry-provisioning.dto';
import { UpdateSubscriptionStatusDto } from './dto/update-subscription-status.dto';

/** Non-sensitive user fields to embed in family/member responses. */
const memberUserSelect = {
  id: true,
  email: true,
  fullName: true,
  avatarUrl: true,
  userType: true,
} as const;

const familyMemberInclude = {
  members: {
    include: { user: { select: memberUserSelect } },
    orderBy: { joinedAt: 'asc' as const },
  },
};

const MONTHLY_PLAN_CODE = 'MONTHLY';
const YEARLY_PLAN_CODE = 'YEARLY';
const DEFAULT_CURRENCY = 'vnd';

const adminPaymentInclude = {
  family: {
    select: {
      id: true,
      name: true,
      subscription: {
        select: {
          plan: {
            select: {
              planCode: true,
            },
          },
        },
      },
    },
  },
} as const;

type AdminPaymentRow = Prisma.PaymentTransactionGetPayload<{
  include: typeof adminPaymentInclude;
}>;

const adminSubscriptionInclude = {
  family: { select: { id: true, name: true } },
  plan: {
    select: {
      planCode: true,
      name: true,
      annualPrice: true,
      billingPeriod: true,
      monthlyPrice: true,
      yearlyPrice: true,
    },
  },
} as const;

type AdminSubscriptionRow = Prisma.FamilySubscriptionGetPayload<{
  include: typeof adminSubscriptionInclude;
}>;

const provisioningLogInclude = {
  workspace: { select: { id: true, name: true } },
} as const;

type ProvisioningLogRow = Prisma.WorkspaceProvisioningLogGetPayload<{
  include: typeof provisioningLogInclude;
}>;

type JsonRecord = Record<string, unknown>;

export interface AdminPaymentListItem {
  paymentId: string;
  familyId: string;
  familyName: string | null;
  family: {
    id: string;
    name: string | null;
  };
  planCode: string | null;
  amount: number;
  currency: string;
  status: AdminPaymentStatus;
  paidAt: Date | null;
  createdAt: Date;
}

type AdminMonthlyRevenueRawRow = {
  month: string;
  totalRevenue: Prisma.Decimal | string | number | null;
  monthlyRevenue: Prisma.Decimal | string | number | null;
  yearlyRevenue: Prisma.Decimal | string | number | null;
  paidCount: bigint | number | string;
  currency: string | null;
};

/**
 * System-admin data access for the basic entities. All queries go straight to
 * Prisma; user records are sanitized.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionLifecycle: SubscriptionLifecycleService,
  ) {}

  // --------------------------------------------------------------------------
  // Dashboard / revenue / payments
  // --------------------------------------------------------------------------

  async getDashboardSummary() {
    const now = new Date();
    const [
      totalUsers,
      activeUsers,
      lockedUsers,
      disabledUsers,
      pendingUsers,
      totalFamilies,
      activeFamilies,
      pendingFamilies,
      suspendedFamilies,
      expiredFamilies,
      activeSubscriptions,
      canceledSubscriptions,
      pastDueSubscriptions,
      expiredSubscriptions,
      subscriptions,
      paidSum,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { accountStatus: AccountStatus.ACTIVE },
      }),
      this.prisma.user.count({
        where: { accountStatus: AccountStatus.SUSPENDED },
      }),
      this.prisma.user.count({
        where: { accountStatus: AccountStatus.INACTIVE },
      }),
      this.prisma.user.count({
        where: { verificationStatus: VerificationStatus.UNVERIFIED },
      }),
      this.prisma.family.count(),
      this.prisma.family.count({ where: { status: WorkspaceStatus.ACTIVE } }),
      this.prisma.family.count({ where: { status: WorkspaceStatus.PENDING } }),
      this.prisma.family.count({
        where: { status: WorkspaceStatus.SUSPENDED },
      }),
      this.prisma.family.count({ where: { status: WorkspaceStatus.EXPIRED } }),
      this.prisma.familySubscription.count({
        where: { status: FamilySubscriptionStatus.ACTIVE },
      }),
      this.prisma.familySubscription.count({
        where: { status: FamilySubscriptionStatus.CANCELED },
      }),
      this.prisma.familySubscription.count({
        where: { status: FamilySubscriptionStatus.PAST_DUE },
      }),
      this.prisma.familySubscription.count({
        where: { currentPeriodEnd: { lt: now } },
      }),
      this.prisma.familySubscription.findMany({
        select: { plan: { select: { planCode: true } } },
      }),
      this.prisma.paymentTransaction.aggregate({
        where: this.paymentStatusWhere('PAID'),
        _sum: { amount: true },
      }),
    ]);

    const paymentCounts = await this.getPaymentStatusCounts();
    const plans = subscriptions.reduce<Record<string, number>>((acc, row) => {
      acc[row.plan.planCode] = (acc[row.plan.planCode] ?? 0) + 1;
      return acc;
    }, {});

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        locked: lockedUsers,
        disabled: disabledUsers,
        pending: pendingUsers,
      },
      families: {
        total: totalFamilies,
        active: activeFamilies,
        pending: pendingFamilies,
        suspended: suspendedFamilies,
        expired: expiredFamilies,
      },
      subscriptions: {
        free: plans.FREE ?? 0,
        monthly: plans[MONTHLY_PLAN_CODE] ?? 0,
        yearly: plans[YEARLY_PLAN_CODE] ?? 0,
        active: activeSubscriptions,
        expired: expiredSubscriptions,
        canceled: canceledSubscriptions,
        pastDue: pastDueSubscriptions,
      },
      payments: {
        totalPaidAmount: this.decimalToNumber(paidSum._sum.amount),
        paidCount: paymentCounts.paid,
        failedCount: paymentCounts.failed,
        pendingCount: paymentCounts.pending,
        currency: await this.getDefaultPaymentCurrency(),
      },
    };
  }

  async getRevenueSummary() {
    await this.hydrateStripePriceIdCache();
    const [payments, currency] = await Promise.all([
      this.getAdminPaymentRows({
        where: this.paymentStatusWhere('PAID'),
        orderBy: { createdAt: 'desc' },
      }),
      this.getDefaultPaymentCurrency(),
    ]);
    const paymentCounts = await this.getPaymentStatusCounts();
    const now = new Date();
    const currentMonth = `${now.getUTCFullYear()}-${String(
      now.getUTCMonth() + 1,
    ).padStart(2, '0')}`;

    let totalRevenue = 0;
    let currentMonthRevenue = 0;
    let monthlyPlanRevenue = 0;
    let yearlyPlanRevenue = 0;

    for (const payment of payments) {
      const amount = this.decimalToNumber(payment.amount);
      const planCode = this.resolvePlanCode(payment);
      totalRevenue += amount;
      if (this.monthKey(payment.createdAt) === currentMonth) {
        currentMonthRevenue += amount;
      }
      if (planCode === MONTHLY_PLAN_CODE) monthlyPlanRevenue += amount;
      if (planCode === YEARLY_PLAN_CODE) yearlyPlanRevenue += amount;
    }

    return {
      totalRevenue,
      currentMonthRevenue,
      monthlyPlanRevenue,
      yearlyPlanRevenue,
      paidPayments: paymentCounts.paid,
      failedPayments: paymentCounts.failed,
      pendingPayments: paymentCounts.pending,
      currency,
    };
  }

  async getMonthlyRevenue(q: AdminRevenueMonthlyQueryDto) {
    const whereConditions: Prisma.Sql[] = [
      Prisma.sql`(pt."type" = 'invoice.paid' OR UPPER(pt."status") = 'PAID')`,
    ];
    if (q.from) {
      whereConditions.push(Prisma.sql`pt."createdAt" >= ${new Date(q.from)}`);
    }
    if (q.to) {
      const end = new Date(q.to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(q.to)) {
        end.setUTCDate(end.getUTCDate() + 1);
        whereConditions.push(Prisma.sql`pt."createdAt" < ${end}`);
      } else {
        whereConditions.push(Prisma.sql`pt."createdAt" <= ${end}`);
      }
    }

    const stripePriceIdSql = Prisma.sql`COALESCE(
      pt."rawPayload"->>'stripePriceId',
      pt."rawPayload"#>>'{data,object,lines,data,0,price,id}',
      pt."rawPayload"#>>'{data,object,lines,data,0,pricing,price_details,price}',
      pt."rawPayload"#>>'{data,object,items,data,0,price,id}',
      pt."rawPayload"#>>'{data,object,price,id}',
      pt."rawPayload"#>>'{lines,data,0,price,id}',
      pt."rawPayload"#>>'{lines,data,0,pricing,price_details,price}',
      pt."rawPayload"#>>'{items,data,0,price,id}',
      pt."rawPayload"#>>'{price,id}'
    )`;
    const planCodeSql = Prisma.sql`COALESCE(
      pt."rawPayload"->>'planCode',
      price_plan."planCode",
      current_plan."planCode"
    )`;

    if (q.planCode) {
      whereConditions.push(Prisma.sql`${planCodeSql} = ${q.planCode}`);
    }

    const rows = await this.prisma.$queryRaw<AdminMonthlyRevenueRawRow[]>(
      Prisma.sql`
        SELECT
          to_char(date_trunc('month', pt."createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM') AS "month",
          COALESCE(SUM(pt."amount"), 0)::text AS "totalRevenue",
          COALESCE(SUM(CASE WHEN ${planCodeSql} = ${MONTHLY_PLAN_CODE} THEN pt."amount" ELSE 0 END), 0)::text AS "monthlyRevenue",
          COALESCE(SUM(CASE WHEN ${planCodeSql} = ${YEARLY_PLAN_CODE} THEN pt."amount" ELSE 0 END), 0)::text AS "yearlyRevenue",
          COUNT(*)::int AS "paidCount",
          COALESCE(MIN(pt."currency"), ${DEFAULT_CURRENCY}) AS "currency"
        FROM "payment_transactions" pt
        LEFT JOIN "family_subscriptions" fs ON fs."familyId" = pt."familyId"
        LEFT JOIN "subscription_plans" current_plan ON current_plan."id" = fs."planId"
        LEFT JOIN "subscription_plans" price_plan ON price_plan."stripePriceId" = ${stripePriceIdSql}
        WHERE ${Prisma.join(whereConditions, ' AND ')}
        GROUP BY date_trunc('month', pt."createdAt" AT TIME ZONE 'UTC')
        ORDER BY "month" ASC
      `,
    );

    return rows.map((row) => ({
      month: row.month,
      totalRevenue: this.rawDecimalToNumber(row.totalRevenue),
      monthlyRevenue: this.rawDecimalToNumber(row.monthlyRevenue),
      yearlyRevenue: this.rawDecimalToNumber(row.yearlyRevenue),
      paidCount: Number(row.paidCount),
      currency: row.currency ?? DEFAULT_CURRENCY,
    }));
  }

  async listPayments(
    q: AdminPaymentQueryDto,
  ): Promise<PaginatedResult<AdminPaymentListItem>> {
    await this.hydrateStripePriceIdCache();
    const where: Prisma.PaymentTransactionWhereInput = {
      ...(q.status ? this.paymentStatusWhere(q.status) : {}),
      ...(q.familyId ? { familyId: q.familyId } : {}),
      ...this.createdAtRange(q.from, q.to),
    };
    const rows = await this.getAdminPaymentRows({
      where,
      orderBy: { createdAt: 'desc' },
    });
    const filtered = q.planCode
      ? rows.filter((row) => this.resolvePlanCode(row) === q.planCode)
      : rows;
    const items = filtered
      .slice(skipFor(q.page, q.limit), skipFor(q.page, q.limit) + q.limit)
      .map((row) => this.toPaymentListItem(row));

    return buildPaginated(items, filtered.length, q.page, q.limit);
  }

  async getFamilySubscription(familyId: string) {
    await this.findFamilyOrThrow(familyId);
    const subscription = await this.prisma.familySubscription.findUnique({
      where: { familyId },
      include: adminSubscriptionInclude,
    });
    if (!subscription) {
      throw new NotFoundException('Không tìm thấy gói dịch vụ của gia đình');
    }

    const latestPayment = await this.prisma.paymentTransaction.findFirst({
      where: { familyId },
      orderBy: { createdAt: 'desc' },
      include: adminPaymentInclude,
    });

    return this.toFamilySubscriptionResponse(subscription, latestPayment);
  }

  async manualRenewSubscription(
    familyId: string,
    adminId: string,
    dto: ManualRenewSubscriptionDto,
  ) {
    await this.findFamilyOrThrow(familyId);
    if (!adminId) {
      throw new BadRequestException(
        'Không xác định được quản trị viên thao tác',
      );
    }

    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { planCode: dto.planCode },
    });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Không tìm thấy gói dịch vụ đang hoạt động');
    }
    if (plan.planCode === FREE_PLAN_CODE) {
      throw new BadRequestException('Không thể gia hạn thủ công gói miễn phí');
    }

    const current = await this.prisma.familySubscription.findUnique({
      where: { familyId },
      include: { plan: true },
    });
    if (!current) {
      throw new NotFoundException(
        'Kh\u00f4ng t\u00ecm th\u1ea5y g\u00f3i d\u1ecbch v\u1ee5 c\u1ee7a gia \u0111\u00ecnh',
      );
    }
    if (current.plan.planCode === FREE_PLAN_CODE) {
      throw new BadRequestException(
        'Kh\u00f4ng th\u1ec3 gia h\u1ea1n th\u1ee7 c\u00f4ng g\u00f3i mi\u1ec5n ph\u00ed',
      );
    }
    if (current.plan.planCode !== plan.planCode) {
      throw new BadRequestException(
        'Gia h\u1ea1n th\u1ee7 c\u00f4ng ch\u1ec9 \u00e1p d\u1ee5ng cho g\u00f3i hi\u1ec7n t\u1ea1i. Kh\u00f4ng d\u00f9ng \u0111\u1ec3 n\u00e2ng/h\u1ea1 g\u00f3i.',
      );
    }
    const now = new Date();
    const oldPeriodEnd = current.currentPeriodEnd ?? null;
    const activePaidPeriodEnd =
      current.currentPeriodEnd && current.currentPeriodEnd > now
        ? current.currentPeriodEnd
        : null;
    const newPeriodStart = activePaidPeriodEnd
      ? new Date(activePaidPeriodEnd)
      : now;
    const newPeriodEnd = this.addMonths(newPeriodStart, dto.monthsToAdd);

    await this.prisma.$transaction(async (tx) => {
      await tx.familySubscription.update({
        where: { familyId },
        data: {
          planId: plan.id,
          status: FamilySubscriptionStatus.ACTIVE,
          currentPeriodStart: newPeriodStart,
          currentPeriodEnd: newPeriodEnd,
          cancelAtPeriodEnd: false,
          purchasedByUserId: adminId,
        },
      });

      await tx.paymentTransaction.create({
        data: {
          familyId,
          stripeEventId: `admin_manual_renew_${randomUUID()}`,
          type: 'admin.manual_renew',
          amount: plan.annualPrice,
          currency: DEFAULT_CURRENCY,
          status: 'PAID',
          rawPayload: {
            source: 'admin.manual_renew',
            familyId,
            planCode: plan.planCode,
            monthsToAdd: dto.monthsToAdd,
            reason: dto.reason ?? null,
            manualRenewedByAdminId: adminId,
            oldPeriodEnd: oldPeriodEnd?.toISOString() ?? null,
            newPeriodStart: newPeriodStart.toISOString(),
            newPeriodEnd: newPeriodEnd.toISOString(),
          },
        },
      });
    });

    return {
      familyId,
      planCode: plan.planCode,
      oldPeriodEnd,
      newPeriodStart,
      newPeriodEnd,
      status: FamilySubscriptionStatus.ACTIVE,
      manualRenewedByAdminId: adminId,
      message: 'Gia hạn gói dịch vụ thủ công thành công.',
    };
  }

  async updateSubscriptionStatus(
    familyId: string,
    dto: UpdateSubscriptionStatusDto,
  ) {
    await this.findFamilyOrThrow(familyId);
    const subscription = await this.prisma.familySubscription.findUnique({
      where: { familyId },
    });
    if (!subscription) {
      throw new NotFoundException('Không tìm thấy gói dịch vụ của gia đình');
    }

    const updated = await this.prisma.familySubscription.update({
      where: { familyId },
      data: { status: dto.status },
      include: adminSubscriptionInclude,
    });

    return {
      ...this.toSafeSubscription(updated),
      reason: dto.reason ?? null,
    };
  }

  async syncFamilySubscriptionFromStripe(familyId: string) {
    await this.findFamilyOrThrow(familyId);
    const subscription = await this.prisma.familySubscription.findUnique({
      where: { familyId },
      select: { stripeSubscriptionId: true },
    });
    const fallbackStripeSubscriptionId =
      await this.latestPaidStripeSubscriptionId(familyId);
    if (!subscription && !fallbackStripeSubscriptionId) {
      throw new NotFoundException('Không tìm thấy gói dịch vụ của gia đình');
    }
    if (!subscription?.stripeSubscriptionId && !fallbackStripeSubscriptionId) {
      throw new BadRequestException(
        'Family workspace chưa có Stripe subscription để đồng bộ.',
      );
    }

    await this.subscriptionLifecycle.syncFamilySubscriptionFromStripe(
      familyId,
      subscription?.stripeSubscriptionId ?? fallbackStripeSubscriptionId!,
    );

    return {
      ...(await this.getFamilySubscription(familyId)),
      message: 'Đồng bộ subscription từ Stripe thành công.',
    };
  }

  async getFamilyActivationStatus(familyId: string) {
    const family = await this.findFamilyWorkspaceOrThrow(familyId);
    const latestProvisioningLog =
      await this.prisma.workspaceProvisioningLog.findFirst({
        where: { workspaceId: familyId },
        orderBy: { createdAt: 'desc' },
        include: provisioningLogInclude,
      });
    const latestSuccessProvisioningLog =
      await this.prisma.workspaceProvisioningLog.findFirst({
        where: {
          workspaceId: familyId,
          status: ProvisioningStatus.SUCCESS,
        },
        orderBy: { createdAt: 'desc' },
        select: { finishedAt: true, createdAt: true },
      });

    return {
      familyId: family.id,
      familyName: family.name,
      workspaceStatus: family.status,
      activationStatus: family.activationStatus,
      provisionedAt:
        latestSuccessProvisioningLog?.finishedAt ??
        latestSuccessProvisioningLog?.createdAt ??
        null,
      currentSubscriptionStatus: family.subscription?.status ?? null,
      latestProvisioningLog: latestProvisioningLog
        ? this.toProvisioningLogItem(latestProvisioningLog)
        : null,
      message: this.activationMessage(family.status, family.activationStatus),
    };
  }

  async listProvisioningLogs(q: ListProvisioningLogsQueryDto) {
    await this.backfillMissingProvisioningLogs(q.familyId);
    const where = this.provisioningLogWhere(q);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.workspaceProvisioningLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipFor(q.page, q.limit),
        take: q.limit,
        include: provisioningLogInclude,
      }),
      this.prisma.workspaceProvisioningLog.count({ where }),
    ]);

    return buildPaginated(
      items.map((item) => this.toProvisioningLogItem(item)),
      total,
      q.page,
      q.limit,
    );
  }

  async listFamilyProvisioningLogs(
    familyId: string,
    q: ListProvisioningLogsQueryDto,
  ) {
    await this.findFamilyWorkspaceOrThrow(familyId);
    await this.backfillMissingProvisioningLogs(familyId);
    const where = this.provisioningLogWhere({ ...q, familyId });

    const [items, total] = await this.prisma.$transaction([
      this.prisma.workspaceProvisioningLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipFor(q.page, q.limit),
        take: q.limit,
        include: provisioningLogInclude,
      }),
      this.prisma.workspaceProvisioningLog.count({ where }),
    ]);

    return buildPaginated(
      items.map((item) => this.toProvisioningLogItem(item)),
      total,
      q.page,
      q.limit,
    );
  }

  async retryWorkspaceProvisioning(
    familyId: string,
    adminId: string,
    dto: RetryProvisioningDto,
  ) {
    await this.findFamilyWorkspaceOrThrow(familyId);
    if (!adminId) {
      throw new BadRequestException(
        'Không xác định được quản trị viên thao tác',
      );
    }

    const latestLog = await this.prisma.workspaceProvisioningLog.findFirst({
      where: { workspaceId: familyId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true },
    });
    if (!latestLog) {
      throw new BadRequestException(
        'Workspace chưa có provisioning record để retry.',
      );
    }
    if (latestLog.status !== ProvisioningStatus.FAILED) {
      throw new BadRequestException(
        'Chỉ được retry khi provisioning gần nhất ở trạng thái FAILED.',
      );
    }

    const simulateResult = dto.simulateResult ?? ProvisioningStatus.SUCCESS;
    if (
      simulateResult !== ProvisioningStatus.SUCCESS &&
      simulateResult !== ProvisioningStatus.FAILED
    ) {
      throw new BadRequestException(
        'Kết quả mô phỏng provisioning không hợp lệ.',
      );
    }

    const now = new Date();
    const logMessage =
      dto.message ??
      (simulateResult === ProvisioningStatus.SUCCESS
        ? 'Retry activation thủ công cho workspace thành công.'
        : 'Retry activation thủ công cho workspace thất bại.');

    const result = await this.prisma.$transaction(async (tx) => {
      const family = await tx.family.update({
        where: { id: familyId },
        data:
          simulateResult === ProvisioningStatus.SUCCESS
            ? {
                activationStatus: ActivationStatus.ACTIVE,
                status: WorkspaceStatus.ACTIVE,
              }
            : {
                activationStatus: ActivationStatus.FAILED,
              },
        select: {
          id: true,
          status: true,
          activationStatus: true,
        },
      });

      const log = await tx.workspaceProvisioningLog.create({
        data: {
          workspaceId: familyId,
          actionType: ProvisioningActionType.RETRY,
          status: simulateResult,
          message: logMessage,
          startedAt: now,
          finishedAt: now,
          createdByUserId: adminId,
        },
      });

      return { family, log };
    });

    return {
      familyId,
      activationStatus: result.family.activationStatus,
      workspaceStatus: result.family.status,
      provisioningStatus: result.log.status,
      actionType: result.log.actionType,
      logId: result.log.id,
      message:
        simulateResult === ProvisioningStatus.SUCCESS
          ? 'Retry provisioning workspace thành công.'
          : 'Retry provisioning workspace thất bại.',
    };
  }

  // --------------------------------------------------------------------------
  // Users
  // --------------------------------------------------------------------------

  async listUsers(q: ListUsersQueryDto): Promise<PaginatedResult<SafeUser>> {
    const where: Prisma.UserWhereInput = {};
    if (q.search) where.email = { contains: q.search, mode: 'insensitive' };
    if (q.userType) where.userType = q.userType;
    if (q.accountStatus) where.accountStatus = q.accountStatus;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipFor(q.page, q.limit),
        take: q.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return buildPaginated(rows.map(sanitizeUser), total, q.page, q.limit);
  }

  async getUser(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return sanitizeUser(user);
  }

  async updateUser(
    id: string,
    dto: AdminUpdateUserDto,
    actorAdminId?: string,
  ): Promise<SafeUser> {
    this.assertNoUserTypeUpdate(dto);
    const target = await this.getUserRowOrThrow(id);
    this.assertCanUpdateUser(target, dto, actorAdminId);
    const user = await this.prisma.user.update({ where: { id }, data: dto });
    return sanitizeUser(user);
  }

  async deleteUser(id: string, actorAdminId?: string): Promise<null> {
    const target = await this.getUserRowOrThrow(id);
    this.assertCanDeleteUser(target, actorAdminId);
    await this.prisma.user.delete({ where: { id } });
    return null;
  }

  private async getUserRowOrThrow(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Khong tim thay nguoi dung');
    return user;
  }

  private assertNoUserTypeUpdate(dto: AdminUpdateUserDto): void {
    if ('userType' in (dto as Record<string, unknown>)) {
      throw new BadRequestException(
        'Khong the cap nhat quyen admin qua API nay',
      );
    }
  }

  private assertCanUpdateUser(
    target: User,
    dto: AdminUpdateUserDto,
    actorAdminId?: string,
  ): void {
    const isLocking =
      dto.accountStatus === AccountStatus.SUSPENDED ||
      dto.accountStatus === AccountStatus.INACTIVE;
    if (!isLocking) return;

    if (actorAdminId && target.id === actorAdminId) {
      throw new BadRequestException(
        'Admin khong the khoa tai khoan dang dang nhap',
      );
    }

    if (target.userType === UserType.SYSTEM_ADMIN) {
      throw new BadRequestException(
        'Khong the khoa tai khoan SYSTEM_ADMIN qua API nay',
      );
    }
  }

  private assertCanDeleteUser(target: User, actorAdminId?: string): void {
    if (actorAdminId && target.id === actorAdminId) {
      throw new BadRequestException(
        'Admin khong the xoa tai khoan dang dang nhap',
      );
    }

    if (target.userType === UserType.SYSTEM_ADMIN) {
      throw new BadRequestException(
        'Khong the xoa tai khoan SYSTEM_ADMIN qua API nay',
      );
    }
  }

  // --------------------------------------------------------------------------
  // Families
  // --------------------------------------------------------------------------

  async listFamilies(q: ListFamiliesQueryDto) {
    const where: Prisma.FamilyWhereInput = {};
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' };
    if (q.status) where.status = q.status;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.family.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipFor(q.page, q.limit),
        take: q.limit,
        include: { _count: { select: { members: true } } },
      }),
      this.prisma.family.count({ where }),
    ]);

    return buildPaginated(items, total, q.page, q.limit);
  }

  async getFamily(id: string) {
    const family = await this.prisma.family.findUnique({
      where: { id },
      include: familyMemberInclude,
    });
    if (!family) throw new NotFoundException('Không tìm thấy gia đình');
    return family;
  }

  async updateFamily(id: string, dto: AdminUpdateFamilyDto) {
    await this.getFamily(id);
    return this.prisma.family.update({
      where: { id },
      data: dto,
      include: familyMemberInclude,
    });
  }

  async deleteFamily(id: string): Promise<null> {
    await this.getFamily(id);
    await this.prisma.family.delete({ where: { id } });
    return null;
  }

  // --------------------------------------------------------------------------
  // Join requests (đọc/xóa — duyệt là nghiệp vụ của FAMILY_MANAGER)
  // --------------------------------------------------------------------------

  async listJoinRequests(q: ListJoinRequestsQueryDto) {
    const where: Prisma.JoinRequestWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.familyId) where.familyId = q.familyId;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.joinRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipFor(q.page, q.limit),
        take: q.limit,
        include: {
          user: { select: memberUserSelect },
          family: { select: { id: true, name: true } },
        },
      }),
      this.prisma.joinRequest.count({ where }),
    ]);

    return buildPaginated(items, total, q.page, q.limit);
  }

  async getJoinRequest(id: string) {
    const request = await this.prisma.joinRequest.findUnique({
      where: { id },
      include: {
        user: { select: memberUserSelect },
        family: { select: { id: true, name: true } },
      },
    });
    if (!request) {
      throw new NotFoundException('Không tìm thấy yêu cầu tham gia');
    }
    return request;
  }

  async deleteJoinRequest(id: string): Promise<null> {
    await this.getJoinRequest(id);
    await this.prisma.joinRequest.delete({ where: { id } });
    return null;
  }

  // --------------------------------------------------------------------------
  // Family members
  // --------------------------------------------------------------------------

  async listMembers(q: ListMembersQueryDto) {
    const where: Prisma.FamilyMemberWhereInput = {};
    if (q.familyId) where.familyId = q.familyId;
    if (q.userId) where.userId = q.userId;
    if (q.familyRole) where.familyRole = q.familyRole;
    if (q.status) where.status = q.status;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.familyMember.findMany({
        where,
        orderBy: { joinedAt: 'desc' },
        skip: skipFor(q.page, q.limit),
        take: q.limit,
        include: {
          user: { select: memberUserSelect },
          family: { select: { id: true, name: true } },
        },
      }),
      this.prisma.familyMember.count({ where }),
    ]);

    return buildPaginated(items, total, q.page, q.limit);
  }

  async getMember(id: string) {
    const member = await this.prisma.familyMember.findUnique({
      where: { id },
      include: {
        user: { select: memberUserSelect },
        family: { select: { id: true, name: true } },
      },
    });
    if (!member)
      throw new NotFoundException('Không tìm thấy thành viên gia đình');
    return member;
  }

  async updateMember(id: string, dto: AdminUpdateMemberDto) {
    await this.getMember(id);
    return this.prisma.familyMember.update({
      where: { id },
      data: dto,
      include: { user: { select: memberUserSelect } },
    });
  }

  async deleteMember(id: string): Promise<null> {
    await this.getMember(id);
    await this.prisma.familyMember.delete({ where: { id } });
    return null;
  }

  private async getAdminPaymentRows(args: {
    where?: Prisma.PaymentTransactionWhereInput;
    orderBy?: Prisma.PaymentTransactionOrderByWithRelationInput;
  }): Promise<AdminPaymentRow[]> {
    return this.prisma.paymentTransaction.findMany({
      where: args.where,
      orderBy: args.orderBy,
      include: adminPaymentInclude,
    });
  }

  private async getPaymentStatusCounts() {
    const [paid, failed, total] = await this.prisma.$transaction([
      this.prisma.paymentTransaction.count({
        where: this.paymentStatusWhere('PAID'),
      }),
      this.prisma.paymentTransaction.count({
        where: this.paymentStatusWhere('FAILED'),
      }),
      this.prisma.paymentTransaction.count(),
    ]);
    return { paid, failed, pending: Math.max(total - paid - failed, 0) };
  }

  private paymentStatusWhere(
    status: AdminPaymentStatus,
  ): Prisma.PaymentTransactionWhereInput {
    if (status === 'PAID') {
      return {
        OR: [
          { type: 'invoice.paid' },
          { status: { equals: 'PAID', mode: 'insensitive' } },
        ],
      };
    }
    if (status === 'FAILED') {
      return {
        OR: [
          { type: 'invoice.payment_failed' },
          { status: { equals: 'FAILED', mode: 'insensitive' } },
        ],
      };
    }
    return {
      NOT: [this.paymentStatusWhere('PAID'), this.paymentStatusWhere('FAILED')],
    };
  }

  private normalizePaymentStatus(row: {
    type: string;
    status: string;
  }): AdminPaymentStatus {
    const stored = row.status.toUpperCase();
    if (row.type === 'invoice.paid' || stored === 'PAID') return 'PAID';
    if (row.type === 'invoice.payment_failed' || stored === 'FAILED') {
      return 'FAILED';
    }
    return 'PENDING';
  }

  private toPaymentListItem(row: AdminPaymentRow): AdminPaymentListItem {
    const status = this.normalizePaymentStatus(row);
    return {
      paymentId: row.id,
      familyId: row.familyId,
      familyName: row.family?.name ?? null,
      family: {
        id: row.familyId,
        name: row.family?.name ?? null,
      },
      planCode: this.resolvePlanCode(row),
      amount: this.decimalToNumber(row.amount),
      currency: row.currency ?? DEFAULT_CURRENCY,
      status,
      paidAt:
        status === 'PAID' ? (this.extractPaidAt(row) ?? row.createdAt) : null,
      createdAt: row.createdAt,
    };
  }

  private async findFamilyOrThrow(familyId: string) {
    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      select: { id: true, name: true },
    });
    if (!family) throw new NotFoundException('Không tìm thấy gia đình');
    return family;
  }

  private async findFamilyWorkspaceOrThrow(familyId: string) {
    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      select: {
        id: true,
        name: true,
        status: true,
        activationStatus: true,
        subscription: { select: { status: true } },
      },
    });
    if (!family) {
      throw new NotFoundException('Không tìm thấy family workspace.');
    }
    return family;
  }

  private async backfillMissingProvisioningLogs(
    familyId?: string,
  ): Promise<void> {
    const familyScope: Prisma.FamilyWhereInput = familyId
      ? { id: familyId }
      : {};
    const [missingCreate, missingActivate] = await this.prisma.$transaction([
      this.prisma.family.findMany({
        where: {
          ...familyScope,
          provisioningLogs: {
            none: { actionType: ProvisioningActionType.CREATE },
          },
        },
        select: { id: true, createdById: true, createdAt: true },
      }),
      this.prisma.family.findMany({
        where: {
          ...familyScope,
          status: WorkspaceStatus.ACTIVE,
          activationStatus: ActivationStatus.ACTIVE,
          provisioningLogs: {
            none: { actionType: ProvisioningActionType.ACTIVATE },
          },
        },
        select: {
          id: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const createRows: Prisma.WorkspaceProvisioningLogCreateManyInput[] =
      missingCreate.map((family) => ({
        workspaceId: family.id,
        actionType: ProvisioningActionType.CREATE,
        status: ProvisioningStatus.SUCCESS,
        message: 'Backfilled family workspace creation log.',
        startedAt: family.createdAt,
        finishedAt: family.createdAt,
        createdByUserId: family.createdById,
        createdAt: family.createdAt,
      }));
    const activateRows: Prisma.WorkspaceProvisioningLogCreateManyInput[] =
      missingActivate.map((family) => ({
        workspaceId: family.id,
        actionType: ProvisioningActionType.ACTIVATE,
        status: ProvisioningStatus.SUCCESS,
        message: 'Backfilled family workspace activation log.',
        startedAt: family.createdAt,
        finishedAt: family.updatedAt,
        createdByUserId: family.createdById,
        createdAt: family.updatedAt,
      }));

    const rows = [...createRows, ...activateRows];
    if (!rows.length) return;

    await this.prisma.workspaceProvisioningLog.createMany({
      data: rows,
    });
  }

  private provisioningLogWhere(
    q: Pick<ListProvisioningLogsQueryDto, 'familyId' | 'status' | 'actionType'>,
  ): Prisma.WorkspaceProvisioningLogWhereInput {
    const where: Prisma.WorkspaceProvisioningLogWhereInput = {};
    if (q.familyId) where.workspaceId = q.familyId;
    if (q.status) where.status = q.status;
    if (q.actionType) where.actionType = q.actionType;
    return where;
  }

  private toProvisioningLogItem(row: ProvisioningLogRow) {
    return {
      id: row.id,
      familyId: row.workspaceId,
      familyName: row.workspace?.name ?? null,
      actionType: row.actionType,
      status: row.status,
      message: row.message,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
    };
  }

  private activationMessage(
    workspaceStatus: WorkspaceStatus,
    activationStatus: ActivationStatus,
  ): string {
    if (activationStatus === ActivationStatus.FAILED) {
      return 'Workspace kích hoạt thất bại, cần retry provisioning.';
    }
    if (
      activationStatus === ActivationStatus.PENDING ||
      workspaceStatus === WorkspaceStatus.PENDING
    ) {
      return 'Workspace đang chờ kích hoạt.';
    }
    if (
      activationStatus === ActivationStatus.ACTIVE &&
      workspaceStatus === WorkspaceStatus.ACTIVE
    ) {
      return 'Workspace đang hoạt động.';
    }
    return 'Workspace đang ở trạng thái cần kiểm tra.';
  }

  private toFamilySubscriptionResponse(
    subscription: AdminSubscriptionRow,
    latestPayment: AdminPaymentRow | null,
  ) {
    const currentPeriodStart =
      subscription.currentPeriodStart ??
      this.extractManualPeriodStart(latestPayment?.rawPayload) ??
      this.extractPayloadDate(latestPayment?.rawPayload, ['periodStart']) ??
      (latestPayment ? this.extractPaidAt(latestPayment) : null);

    return {
      ...this.toSafeSubscription(subscription),
      currentPeriodStart,
      remainingDays: this.remainingDays(subscription.currentPeriodEnd),
      latestPayment: latestPayment
        ? this.toPaymentListItem(latestPayment)
        : null,
    };
  }

  private toSafeSubscription(subscription: AdminSubscriptionRow) {
    return {
      familyId: subscription.familyId,
      familyName: subscription.family?.name ?? null,
      planCode: subscription.plan.planCode,
      status: subscription.status,
      currentPlanCode: subscription.plan.planCode,
      subscriptionStatus: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      plan: {
        planCode: subscription.plan.planCode,
        name: subscription.plan.name,
        annualPrice: this.decimalToNumber(subscription.plan.annualPrice),
        billingPeriod: subscription.plan.billingPeriod,
        monthlyPrice: this.decimalToNumber(subscription.plan.monthlyPrice),
        yearlyPrice: this.decimalToNumber(subscription.plan.yearlyPrice),
      },
    };
  }

  private extractManualPeriodStart(rawPayload?: Prisma.JsonValue): Date | null {
    if (!rawPayload) return null;
    const value = this.stringAt(rawPayload, ['newPeriodStart']);
    return value ? new Date(value) : null;
  }

  private extractPayloadDate(
    rawPayload: Prisma.JsonValue | undefined,
    path: Array<string | number>,
  ): Date | null {
    if (!rawPayload) return null;
    const value = this.stringAt(rawPayload, path);
    return value ? new Date(value) : null;
  }

  private remainingDays(currentPeriodEnd: Date | null): number {
    if (!currentPeriodEnd) return 0;
    const diff = currentPeriodEnd.getTime() - Date.now();
    return Math.max(Math.ceil(diff / 86_400_000), 0);
  }

  private addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    const day = result.getUTCDate();
    result.setUTCMonth(result.getUTCMonth() + months);
    if (result.getUTCDate() !== day) {
      result.setUTCDate(0);
    }
    return result;
  }

  private resolvePlanCode(row: AdminPaymentRow): string | null {
    return (
      this.extractPlanCode(row.rawPayload) ??
      row.family?.subscription?.plan?.planCode ??
      null
    );
  }

  private extractPlanCode(rawPayload: Prisma.JsonValue): string | null {
    const direct = this.stringAt(rawPayload, ['planCode']);
    if (direct) return direct;

    const priceId = this.extractStripePriceId(rawPayload);
    if (!priceId) return null;
    return this.stripePriceIdToPlanCodeCache.get(priceId) ?? null;
  }

  private extractStripePriceId(rawPayload: Prisma.JsonValue): string | null {
    const direct = this.stringAt(rawPayload, ['stripePriceId']);
    if (direct) return direct;

    const object = this.eventObject(rawPayload) ?? rawPayload;
    return (
      this.stringAt(object, ['lines', 'data', 0, 'price', 'id']) ??
      this.stringAt(object, [
        'lines',
        'data',
        0,
        'pricing',
        'price_details',
        'price',
      ]) ??
      this.stringAt(object, ['items', 'data', 0, 'price', 'id']) ??
      this.stringAt(object, ['price', 'id']) ??
      null
    );
  }

  private async latestPaidStripeSubscriptionId(
    familyId: string,
  ): Promise<string | null> {
    const payment = await this.prisma.paymentTransaction.findFirst({
      where: { familyId, ...this.paymentStatusWhere('PAID') },
      orderBy: { createdAt: 'desc' },
      select: { rawPayload: true },
    });
    return payment
      ? this.extractStripeSubscriptionId(payment.rawPayload)
      : null;
  }

  private extractStripeSubscriptionId(
    rawPayload: Prisma.JsonValue,
  ): string | null {
    const direct = this.stringAt(rawPayload, ['stripeSubscriptionId']);
    if (direct) return direct;

    const object = this.eventObject(rawPayload) ?? rawPayload;
    return (
      this.stringAt(object, ['subscription']) ??
      this.stringAt(object, ['subscription_details', 'subscription']) ??
      this.stringAt(object, [
        'parent',
        'subscription_details',
        'subscription',
      ]) ??
      null
    );
  }

  private extractPaidAt(row: AdminPaymentRow): Date | null {
    const direct = this.stringAt(row.rawPayload, ['paidAt']);
    if (direct) return new Date(direct);

    const object = this.eventObject(row.rawPayload) ?? row.rawPayload;
    const paidAt =
      this.numberAt(object, ['status_transitions', 'paid_at']) ??
      this.numberAt(object, ['paid_at']);
    if (paidAt) return new Date(paidAt * 1000);
    return null;
  }

  private readonly stripePriceIdToPlanCodeCache = new Map<string, string>();
  private stripePriceIdCacheHydrated = false;

  private async hydrateStripePriceIdCache(): Promise<void> {
    if (this.stripePriceIdCacheHydrated) return;
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { stripePriceId: { not: null } },
      select: { planCode: true, stripePriceId: true },
    });
    for (const plan of plans) {
      if (plan.stripePriceId) {
        this.stripePriceIdToPlanCodeCache.set(
          plan.stripePriceId,
          plan.planCode,
        );
      }
    }
    this.stripePriceIdCacheHydrated = true;
  }

  private eventObject(rawPayload: Prisma.JsonValue): JsonRecord | null {
    const event = this.asRecord(rawPayload);
    return this.asRecord(this.valueAt(event, ['data', 'object'])) ?? event;
  }

  private asRecord(value: unknown): JsonRecord | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as JsonRecord)
      : null;
  }

  private valueAt(source: unknown, path: Array<string | number>): unknown {
    let cursor: unknown = source;
    for (const segment of path) {
      if (typeof segment === 'number') {
        if (!Array.isArray(cursor)) return null;
        cursor = cursor[segment];
      } else {
        const record = this.asRecord(cursor);
        if (!record) return null;
        cursor = record[segment];
      }
    }
    return cursor ?? null;
  }

  private stringAt(
    source: unknown,
    path: Array<string | number>,
  ): string | null {
    const value = this.valueAt(source, path);
    return typeof value === 'string' && value ? value : null;
  }

  private numberAt(
    source: unknown,
    path: Array<string | number>,
  ): number | null {
    const value = this.valueAt(source, path);
    return typeof value === 'number' ? value : null;
  }

  private async getDefaultPaymentCurrency(): Promise<string> {
    const payment = await this.prisma.paymentTransaction.findFirst({
      where: { currency: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { currency: true },
    });
    return payment?.currency ?? DEFAULT_CURRENCY;
  }

  private decimalToNumber(value: Prisma.Decimal | null | undefined): number {
    return value ? value.toNumber() : 0;
  }

  private rawDecimalToNumber(
    value: Prisma.Decimal | string | number | null | undefined,
  ): number {
    if (value instanceof Prisma.Decimal) return value.toNumber();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    return 0;
  }

  private monthKey(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
      2,
      '0',
    )}`;
  }

  private createdAtRange(
    from?: string,
    to?: string,
  ): Prisma.PaymentTransactionWhereInput {
    const createdAt: Prisma.DateTimeFilter = {};
    if (from) createdAt.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        end.setUTCDate(end.getUTCDate() + 1);
        createdAt.lt = end;
      } else {
        createdAt.lte = end;
      }
    }
    return Object.keys(createdAt).length > 0 ? { createdAt } : {};
  }
}
