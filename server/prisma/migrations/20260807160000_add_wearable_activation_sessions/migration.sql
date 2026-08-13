-- CreateEnum
CREATE TYPE "WearableActivationStatus" AS ENUM ('PENDING', 'PAIRED', 'CLAIMED', 'EXPIRED');

-- CreateTable
CREATE TABLE "wearable_activation_sessions" (
    "activation_session_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "status" "WearableActivationStatus" NOT NULL DEFAULT 'PENDING',
    "device_name" TEXT,
    "device_type" "WearableDeviceType" NOT NULL DEFAULT 'SMARTWATCH',
    "workspace_id" TEXT,
    "owner_member_id" TEXT,
    "owner_user_id" TEXT,
    "wearable_device_id" UUID,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "claimed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wearable_activation_sessions_pkey" PRIMARY KEY ("activation_session_id")
);

-- CreateIndex
CREATE INDEX "wearable_activation_sessions_code_status_idx" ON "wearable_activation_sessions"("code", "status");

-- CreateIndex
CREATE INDEX "wearable_activation_sessions_expires_at_idx" ON "wearable_activation_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "wearable_activation_sessions_owner_user_id_idx" ON "wearable_activation_sessions"("owner_user_id");

-- CreateIndex
CREATE INDEX "wearable_activation_sessions_wearable_device_id_idx" ON "wearable_activation_sessions"("wearable_device_id");

-- Keep display codes unique only while they can still be claimed.
CREATE UNIQUE INDEX "wearable_activation_sessions_live_code_unique"
ON "wearable_activation_sessions"("code")
WHERE "status" IN ('PENDING', 'PAIRED');

-- AddForeignKey
ALTER TABLE "wearable_activation_sessions" ADD CONSTRAINT "wearable_activation_sessions_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wearable_activation_sessions" ADD CONSTRAINT "wearable_activation_sessions_owner_member_id_fkey"
FOREIGN KEY ("owner_member_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wearable_activation_sessions" ADD CONSTRAINT "wearable_activation_sessions_owner_user_id_fkey"
FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wearable_activation_sessions" ADD CONSTRAINT "wearable_activation_sessions_wearable_device_id_fkey"
FOREIGN KEY ("wearable_device_id") REFERENCES "wearable_devices"("device_id") ON DELETE SET NULL ON UPDATE CASCADE;
