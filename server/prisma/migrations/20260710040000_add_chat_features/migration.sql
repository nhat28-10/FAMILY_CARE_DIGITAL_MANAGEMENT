-- AlterTable
ALTER TABLE "conversation_participants" ADD COLUMN     "last_read_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "direct_key" TEXT,
ADD COLUMN     "is_default" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_message_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "pinned_at" TIMESTAMPTZ,
ADD COLUMN     "pinned_by_member_id" TEXT,
ADD COLUMN     "reply_to_message_id" UUID;

-- CreateTable
CREATE TABLE "message_reactions" (
    "reaction_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "message_id" UUID NOT NULL,
    "member_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("reaction_id")
);

-- CreateIndex
CREATE INDEX "message_reactions_message_id_idx" ON "message_reactions"("message_id");

-- CreateIndex
CREATE INDEX "message_reactions_member_id_idx" ON "message_reactions"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_reactions_message_id_member_id_emoji_key" ON "message_reactions"("message_id", "member_id", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_direct_key_key" ON "conversations"("direct_key");

-- CreateIndex
CREATE INDEX "messages_conversation_id_pinned_at_idx" ON "messages"("conversation_id", "pinned_at");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "messages"("message_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_pinned_by_member_id_fkey" FOREIGN KEY ("pinned_by_member_id") REFERENCES "family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("message_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateIndex (thủ công): mỗi workspace chỉ có 1 nhóm chat chung mặc định — chống race khi 2 request cùng ensure.
CREATE UNIQUE INDEX "conversations_default_per_workspace_key" ON "conversations"("workspace_id") WHERE "is_default";
