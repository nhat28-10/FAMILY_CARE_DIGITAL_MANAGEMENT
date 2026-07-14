import { Module } from '@nestjs/common';

import { BillingsModule } from '../billing/billings.module';
import { AdminAuditLogsService } from './admin-audit-logs.service';
import { AdminBackupRestoreService } from './admin-backup-restore.service';
import { AdminInfrastructureService } from './admin-infrastructure.service';
import { AdminService } from './admin.service';
import { AdminSystemService } from './admin-system.service';
import { AdminAuditLogsController } from './controllers/admin-audit-logs.controller';
import { AdminBackupRestoreController } from './controllers/admin-backup-restore.controller';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminFamiliesController } from './controllers/admin-families.controller';
import { AdminFamilyMembersController } from './controllers/admin-family-members.controller';
import { AdminInfrastructureController } from './controllers/admin-infrastructure.controller';
import { AdminPaymentsController } from './controllers/admin-payments.controller';
import { AdminProvisioningLogsController } from './controllers/admin-provisioning-logs.controller';
import { AdminRevenueController } from './controllers/admin-revenue.controller';
import { AdminSystemController } from './controllers/admin-system.controller';
import { AdminUsersController } from './controllers/admin-users.controller';

/**
 * System-admin (SYSTEM_ADMIN) management APIs for the basic entities:
 * users, families, join requests and family members. Every route is guarded by
 * JwtAuthGuard + RolesGuard with @Roles(UserType.SYSTEM_ADMIN).
 */
@Module({
  imports: [BillingsModule],
  controllers: [
    AdminAuditLogsController,
    AdminBackupRestoreController,
    AdminDashboardController,
    AdminRevenueController,
    AdminPaymentsController,
    AdminProvisioningLogsController,
    AdminSystemController,
    AdminInfrastructureController,
    AdminUsersController,
    AdminFamiliesController,
    AdminFamilyMembersController,
  ],
  providers: [
    AdminService,
    AdminSystemService,
    AdminInfrastructureService,
    AdminBackupRestoreService,
    AdminAuditLogsService,
  ],
})
export class AdminModule {}
