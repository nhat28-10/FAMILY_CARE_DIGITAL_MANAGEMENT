import { Module } from '@nestjs/common';

import { AdminSubscriptionPlansController } from './controllers/admin-subscription-plans.controller';
import { SubscriptionPlansController } from './controllers/subscription-plans.controller';
import { SubscriptionPlansService } from './subscription-plans.service';

/**
 * Subscription plan tiers. Admins (SYSTEM_ADMIN) manage the full CRUD via
 * /admin/subscription-plans; authenticated users read active plans via
 * /subscription-plans. Exports the service for the subscriptions module.
 */
@Module({
  controllers: [AdminSubscriptionPlansController, SubscriptionPlansController],
  providers: [SubscriptionPlansService],
  exports: [SubscriptionPlansService],
})
export class SubscriptionPlansModule {}
