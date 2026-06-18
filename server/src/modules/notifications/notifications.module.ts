import { Module } from '@nestjs/common';

import { FamilyMembersModule } from '../family-members/family-members.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Shared in-app notifications. `NotificationsService` is exported so other
 * feature modules (e.g. SOS) can fan out notifications to family members.
 */
@Module({
  imports: [FamilyMembersModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
