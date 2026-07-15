import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { FamilyMembersModule } from '../family-members/family-members.module';
import { UsersModule } from '../users/users.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [JwtModule.register({}), UsersModule, FamilyMembersModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway],
  exports: [NotificationsService],
})
export class NotificationsModule {}
