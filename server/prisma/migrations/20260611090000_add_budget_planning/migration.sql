-- CreateEnum
CREATE TYPE "BudgetPeriodType" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "BudgetPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'CANCELED');

-- CreateTable
CREATE TABLE "budget_plans" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "periodType" "BudgetPeriodType" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "expectedSharedIncome" DECIMAL(18,2),
    "expectedSharedExpense" DECIMAL(18,2),
    "status" "BudgetPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByMemberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budget_plans_period_check" CHECK ("periodEnd" >= "periodStart"),
    CONSTRAINT "budget_plans_expected_income_check" CHECK ("expectedSharedIncome" IS NULL OR "expectedSharedIncome" >= 0),
    CONSTRAINT "budget_plans_expected_expense_check" CHECK ("expectedSharedExpense" IS NULL OR "expectedSharedExpense" >= 0)
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" TEXT NOT NULL,
    "budgetPlanId" TEXT NOT NULL,
    "categoryId" TEXT,
    "jarId" TEXT,
    "plannedAmount" DECIMAL(18,2) NOT NULL,
    "thresholdAmount" DECIMAL(18,2),
    "thresholdPercent" DECIMAL(5,2),
    "essentialType" "EssentialType",
    "note" TEXT,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budget_lines_planned_amount_check" CHECK ("plannedAmount" >= 0),
    CONSTRAINT "budget_lines_threshold_amount_check" CHECK ("thresholdAmount" IS NULL OR "thresholdAmount" >= 0),
    CONSTRAINT "budget_lines_threshold_percent_check" CHECK ("thresholdPercent" IS NULL OR ("thresholdPercent" >= 0 AND "thresholdPercent" <= 100)),
    CONSTRAINT "budget_lines_target_check" CHECK ("categoryId" IS NOT NULL OR "jarId" IS NOT NULL)
);

-- CreateIndex
CREATE INDEX "budget_plans_familyId_idx" ON "budget_plans"("familyId");

-- CreateIndex
CREATE INDEX "budget_plans_periodStart_periodEnd_idx" ON "budget_plans"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "budget_plans_status_idx" ON "budget_plans"("status");

-- Only one active budget plan may cover the exact same family period.
CREATE UNIQUE INDEX "budget_plans_one_active_same_period_key"
ON "budget_plans"("familyId", "periodStart", "periodEnd")
WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "budget_lines_budgetPlanId_idx" ON "budget_lines"("budgetPlanId");

-- CreateIndex
CREATE INDEX "budget_lines_categoryId_idx" ON "budget_lines"("categoryId");

-- CreateIndex
CREATE INDEX "budget_lines_jarId_idx" ON "budget_lines"("jarId");

-- AddForeignKey
ALTER TABLE "budget_plans" ADD CONSTRAINT "budget_plans_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_plans" ADD CONSTRAINT "budget_plans_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budgetPlanId_fkey" FOREIGN KEY ("budgetPlanId") REFERENCES "budget_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "finance_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_jarId_fkey" FOREIGN KEY ("jarId") REFERENCES "finance_jars"("id") ON DELETE SET NULL ON UPDATE CASCADE;
