import { Module } from '@nestjs/common';

import { BillingsModule } from '../billing/billings.module';
import { AdminSubscriptionPlansController } from './controllers/admin-subscription-plans.controller';
import { SubscriptionPlansController } from './controllers/subscription-plans.controller';
import { SubscriptionPlansService } from './subscription-plans.service';

/**
 * Subscription plan tiers. Admins (SYSTEM_ADMIN) manage the full CRUD via
 * /admin/subscription-plans; authenticated users read active plans via
 * /subscription-plans. Imports BillingsModule for StripeService (auto-creating
 * recurring Prices for paid plans). Exports the service for the subscriptions module.
 */
@Module({
  imports: [BillingsModule],
  controllers: [AdminSubscriptionPlansController, SubscriptionPlansController],
  providers: [SubscriptionPlansService],
  exports: [SubscriptionPlansService],
})
export class SubscriptionPlansModule {}
