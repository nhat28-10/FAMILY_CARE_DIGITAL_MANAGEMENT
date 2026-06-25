import { Module } from '@nestjs/common';

import { FamilyMembersModule } from '../family-members/family-members.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FinanceController } from './controllers/finance.controller';
import { FinanceService } from './services/finance.service';

@Module({
  imports: [FamilyMembersModule, NotificationsModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
