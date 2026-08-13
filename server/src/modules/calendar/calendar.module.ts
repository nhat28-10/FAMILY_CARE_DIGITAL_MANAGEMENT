import { Module } from '@nestjs/common';

import { FamilyMembersModule } from '../family-members/family-members.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

@Module({
  imports: [FamilyMembersModule, NotificationsModule, SubscriptionsModule],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
