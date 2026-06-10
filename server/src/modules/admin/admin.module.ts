import { Module } from '@nestjs/common';

import { AdminService } from './admin.service';
import { AdminFamiliesController } from './controllers/admin-families.controller';
import { AdminFamilyMembersController } from './controllers/admin-family-members.controller';
import { AdminInvitationsController } from './controllers/admin-invitations.controller';
import { AdminUsersController } from './controllers/admin-users.controller';

/**
 * System-admin (SYSTEM_ADMIN) management APIs for the basic entities:
 * users, families, invitations and family members. Every route is guarded by
 * JwtAuthGuard + RolesGuard with @Roles(UserType.SYSTEM_ADMIN).
 */
@Module({
  controllers: [
    AdminUsersController,
    AdminFamiliesController,
    AdminInvitationsController,
    AdminFamilyMembersController,
  ],
  providers: [AdminService],
})
export class AdminModule {}
