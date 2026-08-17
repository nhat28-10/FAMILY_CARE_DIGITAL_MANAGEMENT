import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthModule } from '../auth/auth.module';
import { FamilyMembersModule } from '../family-members/family-members.module';
import { UsersModule } from '../users/users.module';
import { LocationsController } from './locations.controller';
import { LocationsGateway } from './locations.gateway';
import { LocationsService } from './locations.service';

/** Chia sẻ vị trí gia đình hằng ngày (ngoài SOS) cho bản đồ thành viên. */
@Module({
  imports: [
    JwtModule.register({}),
    AuthModule,
    UsersModule,
    FamilyMembersModule,
  ],
  controllers: [LocationsController],
  providers: [LocationsService, LocationsGateway],
  exports: [LocationsService, LocationsGateway],
})
export class LocationsModule {}
