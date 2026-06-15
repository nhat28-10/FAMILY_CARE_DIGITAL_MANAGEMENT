-- CreateEnum
CREATE TYPE "BudgetAlertType" AS ENUM ('OVER_BUDGET', 'GOAL_AT_RISK', 'NON_ESSENTIAL_TOO_HIGH');

-- CreateEnum
CREATE TYPE "BudgetAlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "BudgetAlertStatus" AS ENUM ('NEW', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "budget_alerts" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "budgetPlanId" TEXT,
    "goalId" TEXT,
    "jarId" TEXT,
    "categoryId" TEXT,
    "alertType" "BudgetAlertType" NOT NULL,
    "severity" "BudgetAlertSeverity" NOT NULL,
    "thresholdValue" DECIMAL(18,2),
    "actualValue" DECIMAL(18,2),
    "message" TEXT,
    "resolutionNote" TEXT,
    "status" "BudgetAlertStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "budget_alerts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budget_alerts_threshold_value_check" CHECK ("thresholdValue" IS NULL OR "thresholdValue" >= 0),
    CONSTRAINT "budget_alerts_actual_value_check" CHECK ("actualValue" IS NULL OR "actualValue" >= 0)
);

CREATE INDEX "budget_alerts_familyId_idx" ON "budget_alerts"("familyId");
CREATE INDEX "budget_alerts_sourceKey_idx" ON "budget_alerts"("sourceKey");
CREATE INDEX "budget_alerts_budgetPlanId_idx" ON "budget_alerts"("budgetPlanId");
CREATE INDEX "budget_alerts_goalId_idx" ON "budget_alerts"("goalId");
CREATE INDEX "budget_alerts_jarId_idx" ON "budget_alerts"("jarId");
CREATE INDEX "budget_alerts_categoryId_idx" ON "budget_alerts"("categoryId");
CREATE INDEX "budget_alerts_alertType_idx" ON "budget_alerts"("alertType");
CREATE INDEX "budget_alerts_severity_idx" ON "budget_alerts"("severity");
CREATE INDEX "budget_alerts_status_idx" ON "budget_alerts"("status");
CREATE INDEX "budget_alerts_createdAt_idx" ON "budget_alerts"("createdAt");

CREATE UNIQUE INDEX "budget_alerts_one_unresolved_source_key"
ON "budget_alerts"("familyId", "sourceKey")
WHERE "status" IN ('NEW', 'ACKNOWLEDGED');

ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_budgetPlanId_fkey" FOREIGN KEY ("budgetPlanId") REFERENCES "budget_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "financial_goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_jarId_fkey" FOREIGN KEY ("jarId") REFERENCES "finance_jars"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "finance_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
