import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BillingPeriod, Prisma } from '@prisma/client';

import {
  buildPaginated,
  PaginatedResult,
  skipFor,
} from '../../common/types/paginated-result';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../billing/stripe.service';
import { FREE_PLAN_CODE } from './subscription-plans.constants';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { ListSubscriptionPlansQueryDto } from './dto/list-subscription-plans-query.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';

type SubscriptionPlan = Prisma.SubscriptionPlanGetPayload<object>;

/**
 * Data access for subscription plans. Admin (SYSTEM_ADMIN) manages the full
 * lifecycle; family workspaces only read the active plans. For paid plans, a
 * recurring Stripe Price is auto-created (via StripeService) when the admin
 * doesn't supply `stripePriceId`, so plans are self-service end-to-end.
 */
@Injectable()
export class SubscriptionPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  async create(dto: CreateSubscriptionPlanDto): Promise<SubscriptionPlan> {
    const existing = await this.prisma.subscriptionPlan.findUnique({
      where: { planCode: dto.planCode },
    });
    if (existing) {
      throw new ConflictException('Mã gói đã tồn tại');
    }

    const contract = this.resolvePlanContract(dto);

    // Auto-create a recurring Stripe Price for paid plans when none was given.
    let stripePriceId = dto.stripePriceId ?? null;
    if (
      !stripePriceId &&
      dto.planCode !== FREE_PLAN_CODE &&
      contract.billingPeriod !== BillingPeriod.FREE &&
      contract.price > 0 &&
      this.stripeService.isConfigured
    ) {
      stripePriceId = await this.stripeService.createRecurringPrice({
        name: dto.name,
        amount: contract.price,
        interval:
          contract.billingPeriod === BillingPeriod.MONTHLY ? 'month' : 'year',
      });
    }

    return this.prisma.subscriptionPlan.create({
      data: {
        planCode: dto.planCode,
        name: dto.name,
        annualPrice: contract.annualPrice,
        billingPeriod: contract.billingPeriod,
        monthlyPrice: contract.monthlyPrice,
        yearlyPrice: contract.yearlyPrice,
        maxMembers: dto.maxMembers,
        storageLimit: dto.storageLimit,
        featureAccess:
          (dto.featureAccess as Prisma.InputJsonValue | undefined) ?? undefined,
        stripePriceId,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async list(
    q: ListSubscriptionPlansQueryDto,
  ): Promise<PaginatedResult<SubscriptionPlan>> {
    const where: Prisma.SubscriptionPlanWhereInput = {};
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' };
    if (q.isActive !== undefined) where.isActive = q.isActive;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.subscriptionPlan.findMany({
        where,
        orderBy: { annualPrice: 'asc' },
        skip: skipFor(q.page, q.limit),
        take: q.limit,
      }),
      this.prisma.subscriptionPlan.count({ where }),
    ]);

    return buildPaginated(items, total, q.page, q.limit);
  }

  /** Active plans only — what a family manager browses before subscribing. */
  listActive(): Promise<SubscriptionPlan[]> {
    return this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { annualPrice: 'asc' },
    });
  }

  async getById(id: string): Promise<SubscriptionPlan> {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });
    if (!plan) throw new NotFoundException('Không tìm thấy gói đăng ký');
    return plan;
  }

  async update(
    id: string,
    dto: UpdateSubscriptionPlanDto,
  ): Promise<SubscriptionPlan> {
    const current = await this.getById(id);

    if (dto.planCode) {
      const clash = await this.prisma.subscriptionPlan.findFirst({
        where: { planCode: dto.planCode, id: { not: id } },
      });
      if (clash) throw new ConflictException('Mã gói đã tồn tại');
    }

    const stripePriceId = await this.resolveStripePriceIdForUpdate(
      current,
      dto,
    );
    const contract = this.resolvePlanContract(dto, current);

    return this.prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...dto,
        annualPrice: contract.annualPrice,
        billingPeriod: contract.billingPeriod,
        monthlyPrice: contract.monthlyPrice,
        yearlyPrice: contract.yearlyPrice,
        featureAccess:
          (dto.featureAccess as Prisma.InputJsonValue | undefined) ?? undefined,
        ...(stripePriceId !== undefined ? { stripePriceId } : {}),
      },
    });
  }

  /**
   * Decides the `stripePriceId` to persist on update. An explicit value in the
   * DTO always wins. Otherwise, for a paid plan that has no price yet or whose
   * `annualPrice` changed, a new recurring Price is created (and the old one
   * archived, since Stripe prices are immutable). Returns `undefined` to leave
   * the column untouched.
   */
  private async resolveStripePriceIdForUpdate(
    current: SubscriptionPlan,
    dto: UpdateSubscriptionPlanDto,
  ): Promise<string | null | undefined> {
    if (dto.stripePriceId !== undefined) return dto.stripePriceId;
    if (!this.stripeService.isConfigured) return undefined;

    const targetPlanCode = dto.planCode ?? current.planCode;
    if (targetPlanCode === FREE_PLAN_CODE) return undefined;

    const contract = this.resolvePlanContract(dto, current);
    if (contract.billingPeriod === BillingPeriod.FREE) return undefined;

    const targetPrice = contract.price;
    if (targetPrice <= 0) return undefined;

    const priceChanged =
      targetPrice !== Number(current.annualPrice) ||
      contract.billingPeriod !== current.billingPeriod;
    if (current.stripePriceId && !priceChanged) return undefined;

    const newPriceId = await this.stripeService.createRecurringPrice({
      name: dto.name ?? current.name,
      amount: targetPrice,
      interval:
        contract.billingPeriod === BillingPeriod.MONTHLY ? 'month' : 'year',
    });
    if (current.stripePriceId) {
      await this.stripeService.archivePrice(current.stripePriceId);
    }
    return newPriceId;
  }

  private resolvePlanContract(
    dto: UpdateSubscriptionPlanDto,
    current?: SubscriptionPlan,
  ): {
    billingPeriod: BillingPeriod;
    price: number;
    annualPrice: number;
    monthlyPrice: number | null;
    yearlyPrice: number | null;
  } {
    const planCode = dto.planCode ?? current?.planCode;
    const billingPeriod =
      dto.billingPeriod ??
      current?.billingPeriod ??
      this.inferBillingPeriod(planCode);

    if (billingPeriod === BillingPeriod.FREE || planCode === FREE_PLAN_CODE) {
      return {
        billingPeriod: BillingPeriod.FREE,
        price: 0,
        annualPrice: dto.annualPrice ?? 0,
        monthlyPrice: dto.monthlyPrice ?? null,
        yearlyPrice: dto.yearlyPrice ?? null,
      };
    }

    const monthlyPrice =
      dto.monthlyPrice ??
      (current?.monthlyPrice === null || current?.monthlyPrice === undefined
        ? undefined
        : Number(current.monthlyPrice));
    const yearlyPrice =
      dto.yearlyPrice ??
      (current?.yearlyPrice === null || current?.yearlyPrice === undefined
        ? undefined
        : Number(current.yearlyPrice));
    const legacyPrice =
      dto.annualPrice ??
      (current?.annualPrice === undefined
        ? undefined
        : Number(current.annualPrice));

    const price =
      billingPeriod === BillingPeriod.MONTHLY
        ? (monthlyPrice ?? legacyPrice)
        : (yearlyPrice ?? legacyPrice);
    if (price === undefined) {
      throw new BadRequestException(
        billingPeriod === BillingPeriod.MONTHLY
          ? 'monthlyPrice là bắt buộc cho gói MONTHLY.'
          : 'yearlyPrice là bắt buộc cho gói YEARLY.',
      );
    }

    return {
      billingPeriod,
      price,
      annualPrice: dto.annualPrice ?? price,
      monthlyPrice:
        billingPeriod === BillingPeriod.MONTHLY
          ? (dto.monthlyPrice ?? price)
          : (dto.monthlyPrice ?? monthlyPrice ?? null),
      yearlyPrice:
        billingPeriod === BillingPeriod.YEARLY
          ? (dto.yearlyPrice ?? price)
          : (dto.yearlyPrice ?? yearlyPrice ?? null),
    };
  }

  private inferBillingPeriod(planCode?: string): BillingPeriod {
    if (planCode === FREE_PLAN_CODE) return BillingPeriod.FREE;
    if (planCode === 'MONTHLY') return BillingPeriod.MONTHLY;
    return BillingPeriod.YEARLY;
  }

  async remove(id: string): Promise<null> {
    await this.getById(id);
    await this.prisma.subscriptionPlan.delete({ where: { id } });
    return null;
  }
}
