-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

-- DropForeignKey
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_approvedByMemberId_fkey";

-- DropForeignKey
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_claimedById_fkey";

-- DropForeignKey
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_createdByMemberId_fkey";

-- DropForeignKey
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_familyId_fkey";

-- AlterTable
ALTER TABLE "families" ADD COLUMN     "invite_code" TEXT;

-- DropTable
DROP TABLE "invitations";

-- DropEnum
DROP TYPE "InvitationStatus";

-- CreateTable
CREATE TABLE "join_requests" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "decidedByMemberId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "join_requests_familyId_status_idx" ON "join_requests"("familyId", "status");

-- CreateIndex
CREATE INDEX "join_requests_userId_idx" ON "join_requests"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "families_invite_code_key" ON "families"("invite_code");

-- AddForeignKey
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_decidedByMemberId_fkey" FOREIGN KEY ("decidedByMemberId") REFERENCES "family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
