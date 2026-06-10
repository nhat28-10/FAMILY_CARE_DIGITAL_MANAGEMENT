-- CreateEnum
CREATE TYPE "FinanceVisibility" AS ENUM ('PRIVATE', 'FAMILY');

-- CreateEnum
CREATE TYPE "FinanceLedgerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "FinanceCategoryType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "EssentialType" AS ENUM ('ESSENTIAL', 'NON_ESSENTIAL', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "FinanceCategoryStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('INCOME', 'EXPENSE', 'CONTRIBUTION', 'ALLOWANCE', 'REWARD', 'SUPPORT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LedgerEntryStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateTable
CREATE TABLE "member_monthly_finances" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "expectedIncome" DECIMAL(18,2),
    "actualIncome" DECIMAL(18,2),
    "expectedPersonalExpense" DECIMAL(18,2),
    "actualPersonalExpense" DECIMAL(18,2),
    "incomeVisibility" "FinanceVisibility" NOT NULL DEFAULT 'PRIVATE',
    "expenseVisibility" "FinanceVisibility" NOT NULL DEFAULT 'PRIVATE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_monthly_finances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_ledgers" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "ledgerName" TEXT NOT NULL,
    "status" "FinanceLedgerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_categories" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryType" "FinanceCategoryType" NOT NULL,
    "essentialType" "EssentialType" NOT NULL DEFAULT 'NEUTRAL',
    "status" "FinanceCategoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "categoryId" TEXT,
    "createdByMemberId" TEXT NOT NULL,
    "entryType" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT NOT NULL,
    "note" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "status" "LedgerEntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_monthly_finances_periodYear_periodMonth_idx" ON "member_monthly_finances"("periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "member_monthly_finances_memberId_periodMonth_periodYear_key" ON "member_monthly_finances"("memberId", "periodMonth", "periodYear");

-- CreateIndex
CREATE UNIQUE INDEX "finance_ledgers_familyId_key" ON "finance_ledgers"("familyId");

-- CreateIndex
CREATE INDEX "finance_categories_familyId_categoryType_status_idx" ON "finance_categories"("familyId", "categoryType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "finance_categories_familyId_name_categoryType_key" ON "finance_categories"("familyId", "name", "categoryType");

-- CreateIndex
CREATE INDEX "ledger_entries_ledgerId_entryDate_idx" ON "ledger_entries"("ledgerId", "entryDate");

-- CreateIndex
CREATE INDEX "ledger_entries_ledgerId_entryType_status_idx" ON "ledger_entries"("ledgerId", "entryType", "status");

-- CreateIndex
CREATE INDEX "ledger_entries_categoryId_idx" ON "ledger_entries"("categoryId");

-- CreateIndex
CREATE INDEX "ledger_entries_createdByMemberId_idx" ON "ledger_entries"("createdByMemberId");

-- CreateIndex
CREATE INDEX "ledger_entries_sourceType_sourceId_idx" ON "ledger_entries"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "member_monthly_finances" ADD CONSTRAINT "member_monthly_finances_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_ledgers" ADD CONSTRAINT "finance_ledgers_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "finance_ledgers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "finance_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
