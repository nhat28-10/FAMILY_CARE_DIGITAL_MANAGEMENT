-- CreateEnum
CREATE TYPE "FinanceModelType" AS ENUM ('FIVE_JARS', 'EIGHTY_TWENTY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "FinanceModelStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "finance_models" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "modelType" "FinanceModelType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "FinanceModelStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_jars" (
    "id" TEXT NOT NULL,
    "financeModelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jarCode" TEXT NOT NULL,
    "allocationPercentage" DECIMAL(5,2) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_jars_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "finance_jars_allocation_percentage_check"
      CHECK ("allocationPercentage" >= 0 AND "allocationPercentage" <= 100)
);

-- CreateIndex
CREATE INDEX "finance_models_familyId_status_idx" ON "finance_models"("familyId", "status");

-- Only one finance model may be active for a family at a time.
CREATE UNIQUE INDEX "finance_models_one_active_per_family_key"
ON "finance_models"("familyId")
WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "finance_jars_financeModelId_isActive_idx" ON "finance_jars"("financeModelId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "finance_jars_financeModelId_jarCode_key" ON "finance_jars"("financeModelId", "jarCode");

-- AddForeignKey
ALTER TABLE "finance_models" ADD CONSTRAINT "finance_models_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_jars" ADD CONSTRAINT "finance_jars_financeModelId_fkey" FOREIGN KEY ("financeModelId") REFERENCES "finance_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
