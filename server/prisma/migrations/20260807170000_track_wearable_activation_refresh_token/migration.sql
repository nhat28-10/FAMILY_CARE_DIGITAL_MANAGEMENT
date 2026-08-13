-- AlterTable
ALTER TABLE "wearable_activation_sessions"
ADD COLUMN "claimed_refresh_token_id" TEXT;

-- CreateIndex
CREATE INDEX "wearable_activation_sessions_claimed_refresh_token_id_idx"
ON "wearable_activation_sessions"("claimed_refresh_token_id");

-- AddForeignKey
ALTER TABLE "wearable_activation_sessions"
ADD CONSTRAINT "wearable_activation_sessions_claimed_refresh_token_id_fkey"
FOREIGN KEY ("claimed_refresh_token_id") REFERENCES "refresh_tokens"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
