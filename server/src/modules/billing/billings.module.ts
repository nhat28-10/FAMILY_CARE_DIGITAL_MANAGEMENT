import { Module } from '@nestjs/common';

import { StripeWebhookController } from './controllers/stripe-webhook.controller';
import { StripeService } from './stripe.service';
import { WebhookService } from './webhook.service';

/**
 * Stripe integration: owns the Stripe client (StripeService), processes inbound
 * webhooks (WebhookService + controller) and is the only place that talks to
 * Stripe. Exports StripeService so SubscriptionsModule can create checkouts.
 */
@Module({
  controllers: [StripeWebhookController],
  providers: [StripeService, WebhookService],
  exports: [StripeService],
})
export class BillingsModule {}
