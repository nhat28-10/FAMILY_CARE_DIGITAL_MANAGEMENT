import { Module } from '@nestjs/common';

import { FamilyMembersModule } from '../family-members/family-members.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FinanceAlertsController } from './controllers/finance-alerts.controller';
import { FinanceBudgetController } from './controllers/finance-budget.controller';
import { FinanceCategoriesController } from './controllers/finance-categories.controller';
import { FinanceGoalsController } from './controllers/finance-goals.controller';
import { FinanceLedgerController } from './controllers/finance-ledger.controller';
import { FinanceModelsController } from './controllers/finance-models.controller';
import { FinanceMonthlyController } from './controllers/finance-monthly.controller';
import { FinanceReportsController } from './controllers/finance-reports.controller';
import { FinanceSupportRequestsController } from './controllers/finance-support-requests.controller';
import { BudgetAlertService } from './services/budget-alert.service';
import { FinanceReportService } from './services/finance-report.service';
import { FinanceService } from './services/finance.service';
import { FinancialGoalService } from './services/financial-goal.service';
import { SpendingSupportRequestService } from './services/spending-support-request.service';

@Module({
  imports: [FamilyMembersModule, NotificationsModule],
  controllers: [
    FinanceMonthlyController,
    FinanceModelsController,
    FinanceCategoriesController,
    FinanceLedgerController,
    FinanceSupportRequestsController,
    FinanceBudgetController,
    FinanceGoalsController,
    FinanceAlertsController,
    FinanceReportsController,
  ],
  providers: [
    FinanceService,
    FinanceReportService,
    FinancialGoalService,
    BudgetAlertService,
    SpendingSupportRequestService,
  ],
  exports: [
    FinanceService,
    FinanceReportService,
    FinancialGoalService,
    BudgetAlertService,
    SpendingSupportRequestService,
  ],
})
export class FinanceModule {}
