-- CreateEnum
CREATE TYPE "FinancialGoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'CANCELED', 'AT_RISK');

-- CreateTable
CREATE TABLE "financial_goals" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "goalName" TEXT NOT NULL,
    "targetAmount" DECIMAL(18,2) NOT NULL,
    "deadline" DATE,
    "monthlyContributionTarget" DECIMAL(18,2),
    "relatedJarId" TEXT,
    "status" "FinancialGoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByMemberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_goals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "financial_goals_target_amount_check" CHECK ("targetAmount" > 0),
    CONSTRAINT "financial_goals_monthly_contribution_check" CHECK ("monthlyContributionTarget" IS NULL OR "monthlyContributionTarget" >= 0)
);

-- CreateTable
CREATE TABLE "goal_allocations" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "allocatedByMemberId" TEXT NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "goal_allocations_amount_check" CHECK ("amount" > 0)
);

CREATE INDEX "financial_goals_familyId_idx" ON "financial_goals"("familyId");
CREATE INDEX "financial_goals_relatedJarId_idx" ON "financial_goals"("relatedJarId");
CREATE INDEX "financial_goals_status_idx" ON "financial_goals"("status");
CREATE INDEX "financial_goals_deadline_idx" ON "financial_goals"("deadline");
CREATE INDEX "goal_allocations_goalId_idx" ON "goal_allocations"("goalId");
CREATE INDEX "goal_allocations_ledgerEntryId_idx" ON "goal_allocations"("ledgerEntryId");
CREATE INDEX "goal_allocations_allocatedByMemberId_idx" ON "goal_allocations"("allocatedByMemberId");

ALTER TABLE "financial_goals" ADD CONSTRAINT "financial_goals_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financial_goals" ADD CONSTRAINT "financial_goals_relatedJarId_fkey" FOREIGN KEY ("relatedJarId") REFERENCES "finance_jars"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financial_goals" ADD CONSTRAINT "financial_goals_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goal_allocations" ADD CONSTRAINT "goal_allocations_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "financial_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goal_allocations" ADD CONSTRAINT "goal_allocations_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goal_allocations" ADD CONSTRAINT "goal_allocations_allocatedByMemberId_fkey" FOREIGN KEY ("allocatedByMemberId") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
