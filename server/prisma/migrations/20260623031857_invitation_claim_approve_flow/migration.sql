/*
  Warnings:

  - You are about to drop the column `acceptedAt` on the `invitations` table. All the data in the column will be lost.
  - You are about to drop the column `acceptedById` on the `invitations` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InvitationStatus" ADD VALUE 'CLAIMED';
ALTER TYPE "InvitationStatus" ADD VALUE 'APPROVED';
ALTER TYPE "InvitationStatus" ADD VALUE 'REJECTED';

-- DropForeignKey
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_acceptedById_fkey";

-- AlterTable
ALTER TABLE "invitations" DROP COLUMN "acceptedAt",
DROP COLUMN "acceptedById",
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByMemberId" TEXT,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "claimedById" TEXT;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_approvedByMemberId_fkey" FOREIGN KEY ("approvedByMemberId") REFERENCES "family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
