import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

type StripeObjectRecord = Record<string, unknown>;

/**
 * Routes verified Stripe webhook events to subscription lifecycle handlers.
 * Payment idempotency is handled by SubscriptionLifecycleService using stable
 * invoice/payment keys instead of Stripe event ids.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: SubscriptionLifecycleService,
  ) {}

  async handleEvent(event: Stripe.Event): Promise<void> {
    const familyId = await this.resolveFamilyId(event);
    if (!familyId) {
      this.logger.warn(
        `Bỏ qua webhook ${event.type} (${event.id}): không map được family.`,
      );
      return;
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.lifecycle.handleCheckoutCompleted(
          event,
          familyId,
          event.data.object,
        );
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.lifecycle.syncSubscriptionObject(
          familyId,
          event.data.object,
        );
        break;
      case 'customer.subscription.deleted':
        await this.lifecycle.handleSubscriptionDeleted(familyId);
        break;
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        await this.lifecycle.handleInvoicePaid(
          event,
          familyId,
          event.data.object,
        );
        break;
      case 'invoice.payment_failed':
        await this.lifecycle.handleInvoicePaymentFailed(
          event,
          familyId,
          event.data.object,
        );
        break;
      default:
        this.logger.log(`Webhook ${event.type} (${event.id}) không cần xử lý.`);
        break;
    }
  }

  /** Map an event to its family via metadata first, then stored Stripe ids. */
  private async resolveFamilyId(event: Stripe.Event): Promise<string | null> {
    const object = event.data.object as unknown as StripeObjectRecord;

    const metaFamilyId = this.metadataFamilyId(object);
    if (metaFamilyId) return metaFamilyId;

    const clientRef = object['client_reference_id'];
    if (typeof clientRef === 'string' && clientRef) return clientRef;

    const subscriptionId = this.extractSubscriptionId(event.type, object);
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

  private metadataFamilyId(object: StripeObjectRecord): string | null {
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

  private extractSubscriptionId(
    eventType: string,
    object: StripeObjectRecord,
  ): string | null {
    if (eventType.startsWith('customer.subscription.')) {
      return this.asId(object);
    }

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

  /** Stripe ids arrive as either a string id or an expanded object. */
  private asId(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && 'id' in value) {
      const id = (value as { id?: unknown }).id;
      return typeof id === 'string' ? id : null;
    }
    return null;
  }

  private valueAt(source: unknown, path: Array<string | number>): unknown {
    let cursor: unknown = source;
    for (const segment of path) {
      if (typeof segment === 'number') {
        if (!Array.isArray(cursor)) return null;
        cursor = cursor[segment];
      } else {
        if (cursor === null || typeof cursor !== 'object') return null;
        cursor = (cursor as Record<string, unknown>)[segment];
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
}
