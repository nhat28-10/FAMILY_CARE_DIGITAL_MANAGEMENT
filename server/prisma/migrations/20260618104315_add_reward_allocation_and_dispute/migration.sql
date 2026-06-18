-- CreateEnum
CREATE TYPE "RewardDisputeStatus" AS ENUM ('OPEN', 'RESOLVED', 'REJECTED');

-- CreateTable
CREATE TABLE "reward_allocations" (
    "id" TEXT NOT NULL,
    "rewardSettlementId" TEXT NOT NULL,
    "jarId" TEXT,
    "goalId" TEXT,
    "ledgerEntryId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "allocatedByMemberId" TEXT NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_disputes" (
    "id" TEXT NOT NULL,
    "rewardSettlementId" TEXT NOT NULL,
    "reportedByMemberId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RewardDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedByMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "reward_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reward_allocations_rewardSettlementId_idx" ON "reward_allocations"("rewardSettlementId");

-- CreateIndex
CREATE INDEX "reward_allocations_jarId_idx" ON "reward_allocations"("jarId");

-- CreateIndex
CREATE INDEX "reward_allocations_goalId_idx" ON "reward_allocations"("goalId");

-- CreateIndex
CREATE INDEX "reward_allocations_ledgerEntryId_idx" ON "reward_allocations"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "reward_allocations_allocatedByMemberId_idx" ON "reward_allocations"("allocatedByMemberId");

-- CreateIndex
CREATE INDEX "reward_disputes_rewardSettlementId_idx" ON "reward_disputes"("rewardSettlementId");

-- CreateIndex
CREATE INDEX "reward_disputes_reportedByMemberId_idx" ON "reward_disputes"("reportedByMemberId");

-- CreateIndex
CREATE INDEX "reward_disputes_resolvedByMemberId_idx" ON "reward_disputes"("resolvedByMemberId");

-- CreateIndex
CREATE INDEX "reward_disputes_status_idx" ON "reward_disputes"("status");

-- AddForeignKey
ALTER TABLE "reward_allocations" ADD CONSTRAINT "reward_allocations_rewardSettlementId_fkey" FOREIGN KEY ("rewardSettlementId") REFERENCES "reward_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_allocations" ADD CONSTRAINT "reward_allocations_jarId_fkey" FOREIGN KEY ("jarId") REFERENCES "finance_jars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_allocations" ADD CONSTRAINT "reward_allocations_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "financial_goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_allocations" ADD CONSTRAINT "reward_allocations_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_allocations" ADD CONSTRAINT "reward_allocations_allocatedByMemberId_fkey" FOREIGN KEY ("allocatedByMemberId") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_disputes" ADD CONSTRAINT "reward_disputes_rewardSettlementId_fkey" FOREIGN KEY ("rewardSettlementId") REFERENCES "reward_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_disputes" ADD CONSTRAINT "reward_disputes_reportedByMemberId_fkey" FOREIGN KEY ("reportedByMemberId") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_disputes" ADD CONSTRAINT "reward_disputes_resolvedByMemberId_fkey" FOREIGN KEY ("resolvedByMemberId") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
