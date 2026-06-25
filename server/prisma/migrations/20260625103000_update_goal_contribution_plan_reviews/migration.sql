-- AlterEnum
ALTER TYPE "GoalContributionPlanStatus" ADD VALUE IF NOT EXISTS 'PENDING_CONFIRMATION' AFTER 'PLANNED';
ALTER TYPE "GoalContributionPlanStatus" ADD VALUE IF NOT EXISTS 'REJECTED' AFTER 'MISSED';

-- AlterTable
ALTER TABLE "goal_contribution_plans"
ADD COLUMN "pendingAmount" DECIMAL(18,2),
ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "submittedNote" TEXT,
ADD COLUMN "reviewedByMemberId" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewNote" TEXT,
ADD CONSTRAINT "goal_contribution_plans_pending_amount_check" CHECK ("pendingAmount" IS NULL OR "pendingAmount" > 0);

-- CreateIndex
CREATE INDEX "goal_contribution_plans_reviewedByMemberId_idx" ON "goal_contribution_plans"("reviewedByMemberId");

-- AddForeignKey
ALTER TABLE "goal_contribution_plans" ADD CONSTRAINT "goal_contribution_plans_reviewedByMemberId_fkey" FOREIGN KEY ("reviewedByMemberId") REFERENCES "family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
