/*
  Warnings:

  - You are about to drop the column `tokenHash` on the `password_reset_tokens` table. All the data in the column will be lost.
  - Added the required column `codeHash` to the `password_reset_tokens` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "password_reset_tokens_tokenHash_key";

-- AlterTable
ALTER TABLE "password_reset_tokens" DROP COLUMN "tokenHash",
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "codeHash" TEXT NOT NULL;

-- RenameIndex
ALTER INDEX "goal_contribution_plans_goalId_memberId_periodMonth_periodYear_" RENAME TO "goal_contribution_plans_goalId_memberId_periodMonth_periodY_key";
