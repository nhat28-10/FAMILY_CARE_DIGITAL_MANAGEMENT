-- CreateEnum
CREATE TYPE "FamilySubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED');

-- AlterTable
ALTER TABLE "subscription_plans" ADD COLUMN "stripePriceId" TEXT;

-- CreateTable
CREATE TABLE "family_subscriptions" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "FamilySubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(18,2),
    "currency" TEXT,
    "status" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_stripePriceId_key" ON "subscription_plans"("stripePriceId");

-- CreateIndex
CREATE UNIQUE INDEX "family_subscriptions_familyId_key" ON "family_subscriptions"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "family_subscriptions_stripeSubscriptionId_key" ON "family_subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_stripeEventId_key" ON "payment_transactions"("stripeEventId");

-- CreateIndex
CREATE INDEX "payment_transactions_familyId_idx" ON "payment_transactions"("familyId");

-- AddForeignKey
ALTER TABLE "family_subscriptions" ADD CONSTRAINT "family_subscriptions_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_subscriptions" ADD CONSTRAINT "family_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;
