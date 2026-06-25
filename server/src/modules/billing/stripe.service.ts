import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

import { toMinorUnit } from './stripe-currency';

/** Currency used for auto-created plan prices (project bills in VND). */
const DEFAULT_PRICE_CURRENCY = 'vnd';

/**
 * Thin wrapper around the Stripe SDK. Owns the single Stripe client and the
 * operations the app needs: Checkout sessions, webhook verification, and
 * creating/archiving recurring Prices for subscription plans. Configured from
 * env via ConfigService.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private client: Stripe | null = null;

  constructor(private readonly config: ConfigService) {
    if (!this.config.get<string>('stripe.secretKey')) {
      this.logger.warn(
        'STRIPE_SECRET_KEY chưa được cấu hình — các thao tác thanh toán sẽ lỗi.',
      );
    }
  }

  /** Whether a Stripe secret key is configured (gate auto price creation). */
  get isConfigured(): boolean {
    return !!this.config.get<string>('stripe.secretKey');
  }

  /**
   * Lazily build the Stripe client. The SDK rejects an empty API key at
   * construction, so deferring lets the app boot on machines without Stripe
   * configured — only actual payment calls fail (with a clear message).
   */
  private get stripe(): Stripe {
    if (!this.client) {
      const secretKey = this.config.get<string>('stripe.secretKey');
      if (!secretKey) {
        throw new Error('STRIPE_SECRET_KEY chưa được cấu hình');
      }
      // Omit apiVersion so the SDK uses its pinned default (avoids literal drift).
      this.client = new Stripe(secretKey);
    }
    return this.client;
  }

  /**
   * Creates a Stripe Checkout session in `subscription` mode (annual auto-renew).
   * `familyId` is attached as metadata (on both the session and the resulting
   * subscription) so webhooks can map the event back to the family.
   */
  createSubscriptionCheckout(params: {
    familyId: string;
    priceId: string;
    customerId?: string | null;
    successUrl: string;
    cancelUrl: string;
  }): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.familyId,
      metadata: { familyId: params.familyId },
      subscription_data: { metadata: { familyId: params.familyId } },
      ...(params.customerId ? { customer: params.customerId } : {}),
    });
  }

  /**
   * Creates a recurring (annual) Stripe Price for a plan, auto-creating a
   * Product named after the plan. Returns the new Price id. Amount is the human
   * value (e.g. 990000 VND) — scaled to Stripe's unit for the currency.
   */
  async createRecurringYearlyPrice(params: {
    name: string;
    amount: number;
    currency?: string;
  }): Promise<string> {
    const currency = (params.currency ?? DEFAULT_PRICE_CURRENCY).toLowerCase();
    const price = await this.stripe.prices.create({
      currency,
      unit_amount: toMinorUnit(params.amount, currency),
      recurring: { interval: 'year' },
      product_data: { name: params.name },
    });
    return price.id;
  }

  /**
   * Retires an old Price after a plan price change (Stripe prices are
   * immutable). Each auto-created Price is the default price of its own product,
   * and a default price can't be archived directly — so we archive the whole
   * product, which retires it cleanly. Best-effort: never throws.
   */
  async archivePrice(priceId: string): Promise<void> {
    try {
      const price = await this.stripe.prices.retrieve(priceId);
      const productId =
        typeof price.product === 'string' ? price.product : price.product?.id;
      if (productId) {
        await this.stripe.products.update(productId, { active: false });
      } else {
        await this.stripe.prices.update(priceId, { active: false });
      }
    } catch (e) {
      this.logger.warn(
        `Không archive được Stripe price ${priceId}: ${(e as Error).message}`,
      );
    }
  }

  /** Verifies the webhook signature and returns the typed Stripe event. */
  constructEvent(payload: Buffer, signature: string): Stripe.Event {
    const secret = this.config.get<string>('stripe.webhookSecret');
    if (!secret) {
      throw new Error('STRIPE_WEBHOOK_SECRET chưa được cấu hình');
    }
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }
}
