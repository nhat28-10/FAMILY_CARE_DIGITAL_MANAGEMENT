import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FamilySubscription,
  FamilySubscriptionStatus,
  Prisma,
  SubscriptionPlan,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../billing/stripe.service';
import { FREE_PLAN_CODE } from '../subscription-plans/subscription-plans.constants';

type SubscriptionWithPlan = FamilySubscription & { plan: SubscriptionPlan };

/**
 * Family-facing subscription logic: reads the current plan, seeds the default
 * FREE row, and starts Stripe Checkout for upgrades. Webhook-driven state
 * changes live in BillingModule's WebhookService — this service never mutates
 * subscription status itself.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly config: ConfigService,
  ) {}

  /** Current subscription + plan for a family (seeds FREE if missing). */
  async getForFamily(familyId: string): Promise<SubscriptionWithPlan> {
    await this.ensureFreeSubscription(familyId);
    const subscription = await this.prisma.familySubscription.findUnique({
      where: { familyId },
      include: { plan: true },
    });
    if (!subscription) {
      throw new NotFoundException('Không tìm thấy gói của gia đình');
    }
    return subscription;
  }

  /**
   * Ensures the family has a FamilySubscription row, defaulting to the FREE
   * plan. No-op if a row already exists or the FREE plan is not configured.
   * Called on family creation and as a safety net on read.
   */
  async ensureFreeSubscription(
    familyId: string,
  ): Promise<FamilySubscription | null> {
    const existing = await this.prisma.familySubscription.findUnique({
      where: { familyId },
    });
    if (existing) return existing;

    const freePlan = await this.prisma.subscriptionPlan.findUnique({
      where: { planCode: FREE_PLAN_CODE },
    });
    if (!freePlan) return null;

    try {
      return await this.prisma.familySubscription.create({
        data: {
          familyId,
          planId: freePlan.id,
          status: FamilySubscriptionStatus.ACTIVE,
        },
      });
    } catch (e) {
      // Concurrent seed (unique familyId) — return the row that won the race.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        return this.prisma.familySubscription.findUnique({
          where: { familyId },
        });
      }
      throw e;
    }
  }

  /**
   * Creates a Stripe Checkout session to upgrade the family to a paid plan and
   * returns its redirect URL. Validates the target is a configured paid plan
   * and that the family is not already on it.
   */
  async createCheckout(
    familyId: string,
    planCode: string,
    purchasedByUserId: string,
  ): Promise<{ checkoutUrl: string }> {
    if (planCode === FREE_PLAN_CODE) {
      throw new BadRequestException('Không thể thanh toán cho gói miễn phí');
    }

    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { planCode },
    });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Không tìm thấy gói đăng ký');
    }
    if (!plan.stripePriceId) {
      throw new BadRequestException('Gói này chưa được cấu hình thanh toán');
    }

    const current = await this.getForFamily(familyId);
    if (
      current.plan.planCode === planCode &&
      current.status === FamilySubscriptionStatus.ACTIVE
    ) {
      throw new BadRequestException('Gia đình đang sử dụng gói này');
    }

    const session = await this.stripeService.createSubscriptionCheckout({
      familyId,
      purchasedByUserId,
      priceId: plan.stripePriceId,
      customerId: current.stripeCustomerId,
      successUrl: this.config.get<string>('stripe.checkoutSuccessUrl') ?? '',
      cancelUrl: this.config.get<string>('stripe.checkoutCancelUrl') ?? '',
    });

    if (!session.url) {
      throw new BadRequestException('Không tạo được liên kết thanh toán');
    }
    return { checkoutUrl: session.url };
  }
}
