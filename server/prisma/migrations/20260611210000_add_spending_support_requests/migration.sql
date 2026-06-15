-- CreateEnum
CREATE TYPE "SpendingSupportRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

-- CreateTable
CREATE TABLE "spending_support_requests" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "requesterMemberId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "categoryId" TEXT,
    "purpose" TEXT NOT NULL,
    "status" "SpendingSupportRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByMemberId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spending_support_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "spending_support_requests_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "spending_support_requests_review_check" CHECK (
        "status" NOT IN ('APPROVED', 'REJECTED')
        OR ("reviewedByMemberId" IS NOT NULL AND "reviewedAt" IS NOT NULL)
    )
);

CREATE INDEX "spending_support_requests_familyId_idx" ON "spending_support_requests"("familyId");
CREATE INDEX "spending_support_requests_requesterMemberId_idx" ON "spending_support_requests"("requesterMemberId");
CREATE INDEX "spending_support_requests_reviewedByMemberId_idx" ON "spending_support_requests"("reviewedByMemberId");
CREATE INDEX "spending_support_requests_categoryId_idx" ON "spending_support_requests"("categoryId");
CREATE INDEX "spending_support_requests_status_idx" ON "spending_support_requests"("status");
CREATE INDEX "spending_support_requests_createdAt_idx" ON "spending_support_requests"("createdAt");

ALTER TABLE "spending_support_requests" ADD CONSTRAINT "spending_support_requests_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "spending_support_requests" ADD CONSTRAINT "spending_support_requests_requesterMemberId_fkey" FOREIGN KEY ("requesterMemberId") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "spending_support_requests" ADD CONSTRAINT "spending_support_requests_reviewedByMemberId_fkey" FOREIGN KEY ("reviewedByMemberId") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "spending_support_requests" ADD CONSTRAINT "spending_support_requests_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "finance_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
