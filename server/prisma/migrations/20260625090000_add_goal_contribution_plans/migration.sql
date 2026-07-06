-- AddEnum
CREATE TYPE "GoalContributionPlanStatus" AS ENUM ('PLANNED', 'PARTIAL', 'PAID', 'MISSED');

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "jarId" TEXT;

-- CreateTable
CREATE TABLE "goal_contribution_plans" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "plannedAmount" DECIMAL(18,2) NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "GoalContributionPlanStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goal_contribution_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "goal_contribution_plans_planned_amount_check" CHECK ("plannedAmount" >= 0),
    CONSTRAINT "goal_contribution_plans_period_month_check" CHECK ("periodMonth" BETWEEN 1 AND 12)
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ledger_entries_jarId_idx" ON "ledger_entries"("jarId");

-- CreateIndex
CREATE UNIQUE INDEX "goal_contribution_plans_goalId_memberId_periodMonth_periodYear_key" ON "goal_contribution_plans"("goalId", "memberId", "periodMonth", "periodYear");

-- CreateIndex
CREATE INDEX "goal_contribution_plans_familyId_periodYear_periodMonth_idx" ON "goal_contribution_plans"("familyId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "goal_contribution_plans_goalId_periodYear_periodMonth_idx" ON "goal_contribution_plans"("goalId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "goal_contribution_plans_memberId_idx" ON "goal_contribution_plans"("memberId");

-- CreateIndex
CREATE INDEX "goal_contribution_plans_status_idx" ON "goal_contribution_plans"("status");

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_jarId_fkey" FOREIGN KEY ("jarId") REFERENCES "finance_jars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_contribution_plans" ADD CONSTRAINT "goal_contribution_plans_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_contribution_plans" ADD CONSTRAINT "goal_contribution_plans_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "financial_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_contribution_plans" ADD CONSTRAINT "goal_contribution_plans_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
