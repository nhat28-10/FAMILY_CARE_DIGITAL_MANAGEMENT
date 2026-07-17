import { Module } from '@nestjs/common';

import { FamilyMembersModule } from '../family-members/family-members.module';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';

/** Chia sẻ vị trí gia đình hằng ngày (ngoài SOS) cho bản đồ thành viên. */
@Module({
  imports: [FamilyMembersModule],
  controllers: [LocationsController],
  providers: [LocationsService],
})
export class LocationsModule {}
