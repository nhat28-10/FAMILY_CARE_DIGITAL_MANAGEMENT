import { Injectable, Logger } from '@nestjs/common';
import {
  FamilySubscriptionStatus,
  Prisma,
  SubscriptionPlanCode,
} from '@prisma/client';
import Stripe from 'stripe';

import { PrismaService } from '../../prisma/prisma.service';

/** Stripe currencies that have no minor unit — amounts are already whole. */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'ugx',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
]);

/**
 * Applies verified Stripe webhook events to `FamilySubscription`. Uses
 * PrismaService directly (Prisma is @Global) to avoid a circular dependency
 * with SubscriptionsModule. Idempotent: every event is first recorded in
 * `payment_transactions` keyed by the unique `stripeEventId`; a duplicate
 * insert (P2002) means the event was already processed and is skipped.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleEvent(event: Stripe.Event): Promise<void> {
    const familyId = await this.resolveFamilyId(event);
    if (!familyId) {
      this.logger.warn(
        `Bỏ qua webhook ${event.type} (${event.id}): không map được family.`,
      );
      return;
    }

    // Idempotency guard — unique stripeEventId. Duplicate delivery → skip.
    try {
      await this.prisma.paymentTransaction.create({
        data: {
          familyId,
          stripeEventId: event.id,
          type: event.type,
          amount: this.extractAmount(event),
          currency: this.extractCurrency(event),
          status: 'received',
          rawPayload: event as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        this.logger.log(`Webhook ${event.id} đã xử lý trước đó — bỏ qua.`);
        return;
      }
      throw e;
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(familyId, event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.onSubscriptionUpsert(familyId, event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(familyId);
        break;
      case 'invoice.paid':
        await this.onInvoicePaid(familyId, event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.setStatus(familyId, FamilySubscriptionStatus.PAST_DUE);
        break;
      default:
        // Recorded for history but no state change needed.
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  /** Link the Stripe customer + subscription to the family and mark ACTIVE. */
  private async onCheckoutCompleted(
    familyId: string,
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    await this.prisma.familySubscription.update({
      where: { familyId },
      data: {
        stripeCustomerId: this.asId(session.customer),
        stripeSubscriptionId: this.asId(session.subscription),
        status: FamilySubscriptionStatus.ACTIVE,
      },
    });
  }

  /** Sync plan, period and status from the Stripe subscription object. */
  private async onSubscriptionUpsert(
    familyId: string,
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const priceId = subscription.items?.data?.[0]?.price?.id;
    const plan = priceId
      ? await this.prisma.subscriptionPlan.findUnique({
          where: { stripePriceId: priceId },
        })
      : null;

    await this.prisma.familySubscription.update({
      where: { familyId },
      data: {
        ...(plan ? { planId: plan.id } : {}),
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: this.asId(subscription.customer),
        currentPeriodEnd: this.periodEnd(subscription),
        cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
        status: this.mapStatus(subscription.status),
      },
    });
  }

  /** Subscription canceled at Stripe → revert family to FREE. */
  private async onSubscriptionDeleted(familyId: string): Promise<void> {
    const freePlan = await this.prisma.subscriptionPlan.findUnique({
      where: { planCode: SubscriptionPlanCode.FREE },
    });
    await this.prisma.familySubscription.update({
      where: { familyId },
      data: {
        ...(freePlan ? { planId: freePlan.id } : {}),
        status: FamilySubscriptionStatus.CANCELED,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
    });
  }

  /** Renewal succeeded → extend period and mark ACTIVE. */
  private async onInvoicePaid(
    familyId: string,
    invoice: Stripe.Invoice,
  ): Promise<void> {
    const periodEnd = invoice.lines?.data?.[0]?.period?.end;
    await this.prisma.familySubscription.update({
      where: { familyId },
      data: {
        status: FamilySubscriptionStatus.ACTIVE,
        ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000) } : {}),
      },
    });
  }

  private setStatus(
    familyId: string,
    status: FamilySubscriptionStatus,
  ): Promise<unknown> {
    return this.prisma.familySubscription.update({
      where: { familyId },
      data: { status },
    });
  }

  // ---------------------------------------------------------------------------
  // Resolution helpers
  // ---------------------------------------------------------------------------

  /** Map an event to its family via metadata first, then stored Stripe ids. */
  private async resolveFamilyId(event: Stripe.Event): Promise<string | null> {
    const object = event.data.object as unknown as Record<string, unknown>;

    const metaFamilyId = this.metadataFamilyId(object);
    if (metaFamilyId) return metaFamilyId;

    const clientRef = object['client_reference_id'];
    if (typeof clientRef === 'string' && clientRef) return clientRef;

    const subscriptionId = this.asId(object['subscription']);
    if (subscriptionId) {
      const bySub = await this.prisma.familySubscription.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
        select: { familyId: true },
      });
      if (bySub) return bySub.familyId;
    }

    const customerId = this.asId(object['customer']);
    if (customerId) {
      const byCustomer = await this.prisma.familySubscription.findFirst({
        where: { stripeCustomerId: customerId },
        select: { familyId: true },
      });
      if (byCustomer) return byCustomer.familyId;
    }

    return null;
  }

  private metadataFamilyId(object: Record<string, unknown>): string | null {
    const metadata = object['metadata'];
    if (
      metadata &&
      typeof metadata === 'object' &&
      typeof (metadata as Record<string, unknown>)['familyId'] === 'string'
    ) {
      return (metadata as Record<string, string>)['familyId'];
    }
    return null;
  }

  private extractAmount(event: Stripe.Event): Prisma.Decimal | null {
    const object = event.data.object as unknown as Record<string, unknown>;
    const minor =
      (object['amount_paid'] as number | undefined) ??
      (object['amount_total'] as number | undefined);
    if (typeof minor !== 'number') return null;
    // Zero-decimal currencies (VND, JPY, KRW, ...) are already in the main unit;
    // others use the minor unit (cents) and must be divided by 100.
    const currency = this.extractCurrency(event);
    const divisor =
      currency && ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? 1 : 100;
    return new Prisma.Decimal(minor / divisor);
  }

  private extractCurrency(event: Stripe.Event): string | null {
    const object = event.data.object as unknown as Record<string, unknown>;
    const currency = object['currency'];
    return typeof currency === 'string' ? currency : null;
  }

  /** Stripe ids arrive as either a string id or an expanded object. */
  private asId(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && 'id' in value) {
      const id = value.id;
      return typeof id === 'string' ? id : null;
    }
    return null;
  }

  /**
   * `current_period_end` moved onto subscription items in recent API versions;
   * read from the item first, then fall back to the (legacy) top-level field.
   */
  private periodEnd(subscription: Stripe.Subscription): Date | null {
    const item = subscription.items?.data?.[0] as
      | { current_period_end?: number }
      | undefined;
    const raw =
      item?.current_period_end ??
      (subscription as unknown as { current_period_end?: number })
        .current_period_end;
    return typeof raw === 'number' ? new Date(raw * 1000) : null;
  }

  private mapStatus(
    status: Stripe.Subscription['status'],
  ): FamilySubscriptionStatus {
    switch (status) {
      case 'active':
      case 'trialing':
        return FamilySubscriptionStatus.ACTIVE;
      case 'past_due':
      case 'unpaid':
        return FamilySubscriptionStatus.PAST_DUE;
      default:
        return FamilySubscriptionStatus.CANCELED;
    }
  }
}
