-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'ONGOING', 'ENDED', 'MISSED', 'DECLINED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CallParticipantStatus" AS ENUM ('INVITED', 'JOINED', 'DECLINED', 'LEFT', 'NO_ANSWER');

-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'CALL';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CALL';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "related_call_id" UUID;

-- CreateTable
CREATE TABLE "calls" (
    "call_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "initiated_by_member_id" TEXT NOT NULL,
    "room_name" TEXT NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'RINGING',
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connected_at" TIMESTAMPTZ,
    "ended_at" TIMESTAMPTZ,
    "ended_reason" TEXT,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("call_id")
);

-- CreateTable
CREATE TABLE "call_participants" (
    "call_participant_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "call_id" UUID NOT NULL,
    "member_id" TEXT NOT NULL,
    "status" "CallParticipantStatus" NOT NULL DEFAULT 'INVITED',
    "invited_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joined_at" TIMESTAMPTZ,
    "left_at" TIMESTAMPTZ,

    CONSTRAINT "call_participants_pkey" PRIMARY KEY ("call_participant_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calls_room_name_key" ON "calls"("room_name");

-- CreateIndex
CREATE INDEX "calls_conversation_id_started_at_idx" ON "calls"("conversation_id", "started_at");

-- CreateIndex
CREATE INDEX "call_participants_call_id_idx" ON "call_participants"("call_id");

-- CreateIndex
CREATE INDEX "call_participants_member_id_idx" ON "call_participants"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "call_participants_call_id_member_id_key" ON "call_participants"("call_id", "member_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_related_call_id_fkey" FOREIGN KEY ("related_call_id") REFERENCES "calls"("call_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("conversation_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_initiated_by_member_id_fkey" FOREIGN KEY ("initiated_by_member_id") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("call_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
