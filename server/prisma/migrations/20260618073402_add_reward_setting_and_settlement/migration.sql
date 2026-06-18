-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('MONEY_RECORD', 'POINT', 'OTHER');

-- CreateEnum
CREATE TYPE "RewardSettlementStatus" AS ENUM ('PENDING_SETTLEMENT', 'WAITING_CONFIRMATION', 'SETTLED', 'DISPUTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "RewardExternalMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'THIRD_PARTY_WALLET', 'OTHER');

-- CreateTable
CREATE TABLE "reward_settings" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "rewardType" "RewardType" NOT NULL,
    "rewardAmount" DECIMAL(14,2),
    "rewardDescription" TEXT,
    "autoCreateSettlement" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_settlements" (
    "id" TEXT NOT NULL,
    "taskSubmissionId" TEXT NOT NULL,
    "rewardSettingId" TEXT NOT NULL,
    "receiverMemberId" TEXT NOT NULL,
    "settledByMemberId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "RewardSettlementStatus" NOT NULL DEFAULT 'PENDING_SETTLEMENT',
    "externalMethod" "RewardExternalMethod",
    "externalNote" TEXT,
    "settledAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reward_settings_taskId_key" ON "reward_settings"("taskId");

-- CreateIndex
CREATE INDEX "reward_settings_taskId_idx" ON "reward_settings"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "reward_settlements_taskSubmissionId_key" ON "reward_settlements"("taskSubmissionId");

-- CreateIndex
CREATE INDEX "reward_settlements_rewardSettingId_idx" ON "reward_settlements"("rewardSettingId");

-- CreateIndex
CREATE INDEX "reward_settlements_receiverMemberId_idx" ON "reward_settlements"("receiverMemberId");

-- CreateIndex
CREATE INDEX "reward_settlements_settledByMemberId_idx" ON "reward_settlements"("settledByMemberId");

-- CreateIndex
CREATE INDEX "reward_settlements_status_idx" ON "reward_settlements"("status");

-- AddForeignKey
ALTER TABLE "reward_settings" ADD CONSTRAINT "reward_settings_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_settlements" ADD CONSTRAINT "reward_settlements_taskSubmissionId_fkey" FOREIGN KEY ("taskSubmissionId") REFERENCES "task_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_settlements" ADD CONSTRAINT "reward_settlements_rewardSettingId_fkey" FOREIGN KEY ("rewardSettingId") REFERENCES "reward_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_settlements" ADD CONSTRAINT "reward_settlements_receiverMemberId_fkey" FOREIGN KEY ("receiverMemberId") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_settlements" ADD CONSTRAINT "reward_settlements_settledByMemberId_fkey" FOREIGN KEY ("settledByMemberId") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
