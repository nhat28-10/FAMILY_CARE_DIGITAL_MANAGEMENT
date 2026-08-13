import { Module } from '@nestjs/common';

import { FamilyMembersModule } from '../family-members/family-members.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SosModule } from '../sos/sos.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { FamiliesController } from './families.controller';
import { FamiliesService } from './families.service';

@Module({
  imports: [
    FamilyMembersModule,
    SosModule,
    SubscriptionsModule,
    NotificationsModule,
  ],
  controllers: [FamiliesController],
  providers: [FamiliesService],
  exports: [FamiliesService],
})
export class FamiliesModule {}
