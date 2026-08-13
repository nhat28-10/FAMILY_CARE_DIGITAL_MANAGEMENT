-- AlterTable
ALTER TABLE "family_subscriptions" ADD COLUMN     "purchasedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "family_subscriptions" ADD CONSTRAINT "family_subscriptions_purchasedByUserId_fkey" FOREIGN KEY ("purchasedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
