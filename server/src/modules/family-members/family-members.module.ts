import { Module } from '@nestjs/common';

import { FamilyPermissionGuard } from './guards/family-permission.guard';
import { FamilyMembersService } from './family-members.service';

/**
 * Owns family-membership data access and the per-family authorization guard.
 * Both are exported so other feature modules (families, tasks, wallets, ...)
 * can reuse them.
 */
@Module({
  providers: [FamilyMembersService, FamilyPermissionGuard],
  exports: [FamilyMembersService, FamilyPermissionGuard],
})
export class FamilyMembersModule {}
