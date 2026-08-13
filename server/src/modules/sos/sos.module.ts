import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthModule } from '../auth/auth.module';
import { FamilyMembersModule } from '../family-members/family-members.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { EmergencyContactsController } from './controllers/emergency-contacts.controller';
import { MyWearablesController } from './controllers/my-wearables.controller';
import { SosController } from './controllers/sos.controller';
import { SosSettingsController } from './controllers/sos-settings.controller';
import { WearableActivationsController } from './controllers/wearable-activations.controller';
import { WearablesController } from './controllers/wearables.controller';
import { SosService } from './services/sos.service';
import { SosSettingsService } from './services/sos-settings.service';
import { WearableActivationsService } from './services/wearable-activations.service';
import { WearablesService } from './services/wearables.service';
import { SosGateway } from './sos.gateway';

/**
 * SOS alert & safety response. The gateway is exported so `FamiliesModule` can
 * evict removed members from workspace realtime rooms.
 */
@Module({
  imports: [
    JwtModule.register({}),
    AuthModule,
    UsersModule,
    FamilyMembersModule,
    NotificationsModule,
  ],
  controllers: [
    SosController,
    SosSettingsController,
    EmergencyContactsController,
    WearableActivationsController,
    MyWearablesController,
    WearablesController,
  ],
  providers: [
    SosService,
    SosSettingsService,
    WearableActivationsService,
    WearablesService,
    SosGateway,
  ],
  exports: [SosGateway, SosService],
})
export class SosModule {}
