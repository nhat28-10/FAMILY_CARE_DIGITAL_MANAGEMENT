import { Module } from '@nestjs/common';

import { FamilyMembersModule } from '../family-members/family-members.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { JoinRequestsController } from './join-requests.controller';
import { JoinRequestsService } from './join-requests.service';

@Module({
  imports: [FamilyMembersModule, NotificationsModule],
  controllers: [JoinRequestsController],
  providers: [JoinRequestsService],
  exports: [JoinRequestsService],
})
export class JoinRequestsModule {}
