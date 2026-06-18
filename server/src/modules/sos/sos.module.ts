import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { FamilyMembersModule } from '../family-members/family-members.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { SosController } from './controllers/sos.controller';
import { SosService } from './services/sos.service';
import { SosGateway } from './sos.gateway';

/**
 * SOS alert & safety response. The gateway is exported so `FamiliesModule` can
 * evict removed members from workspace realtime rooms.
 */
@Module({
  imports: [
    JwtModule.register({}),
    UsersModule,
    FamilyMembersModule,
    NotificationsModule,
  ],
  controllers: [SosController],
  providers: [SosService, SosGateway],
  exports: [SosGateway],
})
export class SosModule {}
