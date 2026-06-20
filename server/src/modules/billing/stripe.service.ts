import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * Thin wrapper around the Stripe SDK. Owns the single Stripe client and the two
 * operations the app needs: creating a subscription Checkout session and
 * verifying inbound webhook signatures. Configured from env via ConfigService.
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

  /** Verifies the webhook signature and returns the typed Stripe event. */
  constructEvent(payload: Buffer, signature: string): Stripe.Event {
    const secret = this.config.get<string>('stripe.webhookSecret');
    if (!secret) {
      throw new Error('STRIPE_WEBHOOK_SECRET chưa được cấu hình');
    }
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }
}
