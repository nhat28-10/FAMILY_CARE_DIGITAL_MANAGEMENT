-- CreateEnum
CREATE TYPE "SubscriptionPlanCode" AS ENUM ('FREE', 'PLUS', 'PREMIUM');

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "planCode" "SubscriptionPlanCode" NOT NULL,
    "name" TEXT NOT NULL,
    "annualPrice" DECIMAL(18,2) NOT NULL,
    "maxMembers" INTEGER NOT NULL,
    "storageLimit" INTEGER NOT NULL,
    "featureAccess" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_planCode_key" ON "subscription_plans"("planCode");
