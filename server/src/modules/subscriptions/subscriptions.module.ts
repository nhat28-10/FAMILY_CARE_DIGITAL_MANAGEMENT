import { Module } from '@nestjs/common';

import { BillingsModule } from '../billing/billings.module';
import { FamilyMembersModule } from '../family-members/family-members.module';
import { FamilySubscriptionController } from './controllers/family-subscription.controller';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Family-facing subscriptions: view current plan + start Stripe Checkout.
 * Imports BillingsModule for StripeService and FamilyMembersModule for the
 * per-family permission guard. Exports SubscriptionsService so FamiliesModule
 * can seed the FREE plan on family creation.
 */
@Module({
  imports: [BillingsModule, FamilyMembersModule],
  controllers: [FamilySubscriptionController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
