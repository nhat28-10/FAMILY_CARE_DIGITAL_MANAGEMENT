import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FamilySubscriptionStatus, Prisma } from '@prisma/client';
import Stripe from 'stripe';

import { PrismaService } from '../../prisma/prisma.service';
import { FREE_PLAN_CODE } from '../subscription-plans/subscription-plans.constants';
import { fromMinorUnit } from './stripe-currency';
import { StripeService } from './stripe.service';

type StripeObjectRecord = Record<string, unknown>;

type SafePaymentPayload = {
  source: 'stripe';
  eventId: string;
  eventType: string;
  invoiceId: string | null;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  planCode: string | null;
  amount: string | null;
  currency: string | null;
  status: 'PAID' | 'FAILED';
  paidAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
};

@Injectable()
export class SubscriptionLifecycleService {
  private readonly logger = new Logger(SubscriptionLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  async handleCheckoutCompleted(
    event: Stripe.Event,
    familyId: string,
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const stripeSubscriptionId = this.asId(session.subscription);
    const stripeCustomerId = this.asId(session.customer);
    const purchasedByUserId = session.metadata?.purchasedByUserId ?? null;

    await this.prisma.familySubscription.update({
      where: { familyId },
      data: {
        ...(stripeCustomerId ? { stripeCustomerId } : {}),
        ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
        status: FamilySubscriptionStatus.ACTIVE,
        ...(purchasedByUserId ? { purchasedByUserId } : {}),
      },
    });

    if (stripeSubscriptionId) {
      try {
        const subscription =
          await this.stripeService.retrieveSubscription(stripeSubscriptionId);
        await this.syncSubscriptionObject(familyId, subscription, {
          purchasedByUserId,
        });
      } catch (error) {
        this.logger.warn(
          `Không thể đồng bộ subscription sau checkout ${session.id}: ${this.errorMessage(error)}`,
        );
      }
    }

    if (session.payment_status === 'paid' || session.status === 'complete') {
      await this.upsertCheckoutPayment(event, familyId, session);
    }
  }

  async handleInvoicePaid(
    event: Stripe.Event,
    familyId: string,
    invoice: Stripe.Invoice,
  ): Promise<void> {
    const subscription = await this.retrieveInvoiceSubscription(invoice);
    if (subscription) {
      await this.syncSubscriptionObject(familyId, subscription);
    } else {
      await this.syncSubscriptionFromInvoice(
        familyId,
        invoice,
        FamilySubscriptionStatus.ACTIVE,
      );
    }

    await this.upsertInvoicePayment(event, familyId, invoice, 'PAID');
  }

  async handleInvoicePaymentFailed(
    event: Stripe.Event,
    familyId: string,
    invoice: Stripe.Invoice,
  ): Promise<void> {
    await this.syncSubscriptionFromInvoice(
      familyId,
      invoice,
      FamilySubscriptionStatus.PAST_DUE,
    );
    await this.upsertInvoicePayment(event, familyId, invoice, 'FAILED');
  }

  async syncSubscriptionObject(
    familyId: string,
    subscription: Stripe.Subscription,
    options: { purchasedByUserId?: string | null } = {},
  ): Promise<void> {
    const priceId = this.subscriptionPriceId(subscription);
    const plan = priceId ? await this.findPlanByStripePriceId(priceId) : null;
    const period = this.subscriptionPeriod(subscription);

    await this.prisma.familySubscription.update({
      where: { familyId },
      data: {
        ...(plan ? { planId: plan.id } : {}),
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: this.asId(subscription.customer),
        currentPeriodEnd: period.end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
        status: this.mapStripeStatus(subscription.status),
        ...(options.purchasedByUserId
          ? { purchasedByUserId: options.purchasedByUserId }
          : {}),
      },
    });
  }

  async syncFamilySubscriptionFromStripe(
    familyId: string,
    stripeSubscriptionId: string,
  ): Promise<void> {
    const subscription =
      await this.stripeService.retrieveSubscription(stripeSubscriptionId);
    await this.syncSubscriptionObject(familyId, subscription);
  }

  async handleSubscriptionDeleted(familyId: string): Promise<void> {
    const freePlan = await this.prisma.subscriptionPlan.findUnique({
      where: { planCode: FREE_PLAN_CODE },
    });

    await this.prisma.familySubscription.update({
      where: { familyId },
      data: {
        ...(freePlan ? { planId: freePlan.id } : {}),
        status: FamilySubscriptionStatus.CANCELED,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        purchasedByUserId: null,
      },
    });
  }

  async checkExpiredSubscriptions(now = new Date()): Promise<{
    checkedAt: Date;
    expiredCount: number;
  }> {
    const result = await this.prisma.familySubscription.updateMany({
      where: {
        currentPeriodEnd: { lt: now },
        status: {
          in: [
            FamilySubscriptionStatus.ACTIVE,
            FamilySubscriptionStatus.PAST_DUE,
          ],
        },
      },
      data: {
        status: FamilySubscriptionStatus.CANCELED,
        cancelAtPeriodEnd: false,
      },
    });

    return { checkedAt: now, expiredCount: result.count };
  }

  private async syncSubscriptionFromInvoice(
    familyId: string,
    invoice: Stripe.Invoice,
    status: FamilySubscriptionStatus,
  ): Promise<void> {
    const stripeSubscriptionId = this.invoiceSubscriptionId(invoice);
    const stripeCustomerId = this.asId(invoice.customer);
    const stripePriceId = this.invoicePriceId(invoice);
    const plan = stripePriceId
      ? await this.findPlanByStripePriceId(stripePriceId)
      : null;
    const period = this.invoicePeriod(invoice);

    await this.prisma.familySubscription.update({
      where: { familyId },
      data: {
        status,
        ...(plan ? { planId: plan.id } : {}),
        ...(stripeCustomerId ? { stripeCustomerId } : {}),
        ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
        ...(period.end ? { currentPeriodEnd: period.end } : {}),
      },
    });
  }

  private async upsertInvoicePayment(
    event: Stripe.Event,
    familyId: string,
    invoice: Stripe.Invoice,
    status: 'PAID' | 'FAILED',
  ): Promise<void> {
    const paymentKey = this.invoicePaymentKey(invoice);
    if (!paymentKey) {
      this.logger.warn(
        `Bỏ qua payment webhook ${event.id}: không xác định được invoice/payment key.`,
      );
      return;
    }

    const currency = invoice.currency ?? null;
    const minorAmount =
      status === 'PAID'
        ? (invoice.amount_paid ?? invoice.amount_due ?? null)
        : (invoice.amount_due ?? invoice.amount_remaining ?? null);
    const amount =
      typeof minorAmount === 'number' && currency
        ? new Prisma.Decimal(fromMinorUnit(minorAmount, currency))
        : null;
    const stripePriceId = this.invoicePriceId(invoice);
    const plan = stripePriceId
      ? await this.findPlanByStripePriceId(stripePriceId)
      : null;
    const period = this.invoicePeriod(invoice);
    const paidAt = this.invoicePaidAt(invoice);

    const payload = this.safePaymentPayload({
      event,
      invoiceId: invoice.id ?? null,
      checkoutSessionId: null,
      paymentIntentId: this.asId(this.recordOf(invoice)['payment_intent']),
      stripeCustomerId: this.asId(invoice.customer),
      stripeSubscriptionId: this.invoiceSubscriptionId(invoice),
      stripePriceId,
      planCode: plan?.planCode ?? null,
      amount,
      currency,
      status,
      paidAt,
      periodStart: period.start,
      periodEnd: period.end,
    });

    await this.prisma.paymentTransaction.upsert({
      where: { stripeEventId: paymentKey },
      create: {
        familyId,
        stripeEventId: paymentKey,
        type: status === 'PAID' ? 'invoice.paid' : 'invoice.payment_failed',
        amount,
        currency,
        status,
        rawPayload: payload,
      },
      update: {
        familyId,
        type: status === 'PAID' ? 'invoice.paid' : 'invoice.payment_failed',
        amount,
        currency,
        status,
        rawPayload: payload,
      },
    });
  }

  private async upsertCheckoutPayment(
    event: Stripe.Event,
    familyId: string,
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const paymentKey = this.checkoutPaymentKey(session);
    if (!paymentKey) return;

    const currency = session.currency ?? null;
    const amount =
      typeof session.amount_total === 'number' && currency
        ? new Prisma.Decimal(fromMinorUnit(session.amount_total, currency))
        : null;
    const stripeSubscriptionId = this.asId(session.subscription);
    const subscription = stripeSubscriptionId
      ? await this.safeRetrieveSubscription(stripeSubscriptionId)
      : null;
    const stripePriceId = subscription
      ? this.subscriptionPriceId(subscription)
      : null;
    const plan = stripePriceId
      ? await this.findPlanByStripePriceId(stripePriceId)
      : null;
    const period = subscription
      ? this.subscriptionPeriod(subscription)
      : { start: null, end: null };

    const payload = this.safePaymentPayload({
      event,
      invoiceId: this.asId(this.recordOf(session)['invoice']),
      checkoutSessionId: session.id,
      paymentIntentId: this.asId(session.payment_intent),
      stripeCustomerId: this.asId(session.customer),
      stripeSubscriptionId,
      stripePriceId,
      planCode: plan?.planCode ?? null,
      amount,
      currency,
      status: 'PAID',
      paidAt: null,
      periodStart: period.start,
      periodEnd: period.end,
    });

    await this.prisma.paymentTransaction.upsert({
      where: { stripeEventId: paymentKey },
      create: {
        familyId,
        stripeEventId: paymentKey,
        type: 'checkout.session.completed',
        amount,
        currency,
        status: 'PAID',
        rawPayload: payload,
      },
      update: {
        familyId,
        type: 'checkout.session.completed',
        amount,
        currency,
        status: 'PAID',
        rawPayload: payload,
      },
    });
  }

  private async retrieveInvoiceSubscription(
    invoice: Stripe.Invoice,
  ): Promise<Stripe.Subscription | null> {
    const subscriptionId = this.invoiceSubscriptionId(invoice);
    if (!subscriptionId) return null;
    return this.safeRetrieveSubscription(subscriptionId);
  }

  private async safeRetrieveSubscription(
    subscriptionId: string,
  ): Promise<Stripe.Subscription | null> {
    try {
      return await this.stripeService.retrieveSubscription(subscriptionId);
    } catch (error) {
      this.logger.warn(
        `Không thể lấy Stripe subscription ${subscriptionId}: ${this.errorMessage(error)}`,
      );
      return null;
    }
  }

  private async findPlanByStripePriceId(stripePriceId: string) {
    return this.prisma.subscriptionPlan.findUnique({
      where: { stripePriceId },
      select: { id: true, planCode: true },
    });
  }

  private mapStripeStatus(
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

  private invoicePaymentKey(invoice: Stripe.Invoice): string | null {
    if (invoice.id) return `invoice:${invoice.id}`;
    const paymentIntentId = this.asId(this.recordOf(invoice)['payment_intent']);
    return paymentIntentId ? `payment_intent:${paymentIntentId}` : null;
  }

  private checkoutPaymentKey(session: Stripe.Checkout.Session): string | null {
    const invoiceId = this.asId(this.recordOf(session)['invoice']);
    if (invoiceId) return `invoice:${invoiceId}`;
    const paymentIntentId = this.asId(session.payment_intent);
    if (paymentIntentId) return `payment_intent:${paymentIntentId}`;
    return session.id ? `checkout:${session.id}` : null;
  }

  private invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
    const object = this.recordOf(invoice);
    return (
      this.asId(object['subscription']) ??
      this.stringAt(object, ['subscription_details', 'subscription']) ??
      this.stringAt(object, [
        'parent',
        'subscription_details',
        'subscription',
      ]) ??
      null
    );
  }

  private invoicePriceId(invoice: Stripe.Invoice): string | null {
    const line = invoice.lines?.data?.[0] as unknown;
    return (
      this.stringAt(line, ['price', 'id']) ??
      this.stringAt(line, ['pricing', 'price_details', 'price']) ??
      null
    );
  }

  private subscriptionPriceId(
    subscription: Stripe.Subscription,
  ): string | null {
    const item = subscription.items?.data?.[0] as unknown;
    return this.stringAt(item, ['price', 'id']);
  }

  private invoicePeriod(invoice: Stripe.Invoice): {
    start: Date | null;
    end: Date | null;
  } {
    const line = invoice.lines?.data?.[0] as unknown;
    return {
      start: this.dateFromSeconds(this.numberAt(line, ['period', 'start'])),
      end: this.dateFromSeconds(this.numberAt(line, ['period', 'end'])),
    };
  }

  private subscriptionPeriod(subscription: Stripe.Subscription): {
    start: Date | null;
    end: Date | null;
  } {
    const item = subscription.items?.data?.[0] as unknown;
    const object = this.recordOf(subscription);
    return {
      start:
        this.dateFromSeconds(
          this.numberAt(item, ['current_period_start']) ??
            this.numberAt(object, ['current_period_start']),
        ) ?? null,
      end:
        this.dateFromSeconds(
          this.numberAt(item, ['current_period_end']) ??
            this.numberAt(object, ['current_period_end']),
        ) ?? null,
    };
  }

  private invoicePaidAt(invoice: Stripe.Invoice): Date | null {
    const object = this.recordOf(invoice);
    return (
      this.dateFromSeconds(
        this.numberAt(object, ['status_transitions', 'paid_at']),
      ) ?? this.dateFromSeconds(this.numberAt(object, ['paid_at']))
    );
  }

  private safePaymentPayload(input: {
    event: Stripe.Event;
    invoiceId: string | null;
    checkoutSessionId: string | null;
    paymentIntentId: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    stripePriceId: string | null;
    planCode: string | null;
    amount: Prisma.Decimal | null;
    currency: string | null;
    status: 'PAID' | 'FAILED';
    paidAt: Date | null;
    periodStart: Date | null;
    periodEnd: Date | null;
  }): SafePaymentPayload {
    return {
      source: 'stripe',
      eventId: input.event.id,
      eventType: input.event.type,
      invoiceId: input.invoiceId,
      checkoutSessionId: input.checkoutSessionId,
      paymentIntentId: input.paymentIntentId,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripePriceId: input.stripePriceId,
      planCode: input.planCode,
      amount: input.amount?.toString() ?? null,
      currency: input.currency,
      status: input.status,
      paidAt: input.paidAt?.toISOString() ?? null,
      periodStart: input.periodStart?.toISOString() ?? null,
      periodEnd: input.periodEnd?.toISOString() ?? null,
    };
  }

  private dateFromSeconds(value: number | null): Date | null {
    return typeof value === 'number' ? new Date(value * 1000) : null;
  }

  private asId(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && 'id' in value) {
      const id = (value as { id?: unknown }).id;
      return typeof id === 'string' ? id : null;
    }
    return null;
  }

  private recordOf(value: unknown): StripeObjectRecord {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as StripeObjectRecord)
      : {};
  }

  private valueAt(source: unknown, path: Array<string | number>): unknown {
    let cursor: unknown = source;
    for (const segment of path) {
      if (typeof segment === 'number') {
        if (!Array.isArray(cursor)) return null;
        cursor = cursor[segment];
      } else {
        const record = this.recordOf(cursor);
        if (!Object.keys(record).length) return null;
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

  private errorMessage(error: unknown): string {
    if (error instanceof NotFoundException) {
      return 'Không tìm thấy dữ liệu Stripe subscription.';
    }
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
