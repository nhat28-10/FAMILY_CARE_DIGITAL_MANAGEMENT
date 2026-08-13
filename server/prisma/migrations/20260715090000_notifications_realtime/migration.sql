-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'JOIN_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE 'MEMBER';
ALTER TYPE "NotificationType" ADD VALUE 'TASK';
ALTER TYPE "NotificationType" ADD VALUE 'CALENDAR';
ALTER TYPE "NotificationType" ADD VALUE 'FINANCE';
ALTER TYPE "NotificationType" ADD VALUE 'CHAT';

-- AlterTable
ALTER TABLE "calendar_event_participants" ADD COLUMN     "reminder_sent_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "task_assignments" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "deviceName" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_userId_idx" ON "device_tokens"("userId");

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

