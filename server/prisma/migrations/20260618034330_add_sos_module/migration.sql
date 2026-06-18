-- Ensure gen_random_uuid() is available (PG13+ has it in core; pgcrypto is a safety net).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateEnum
CREATE TYPE "SosSourceType" AS ENUM ('MOBILE_APP', 'WEARABLE', 'SIMULATED_DEVICE');

-- CreateEnum
CREATE TYPE "SosAlertStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'CANCELED', 'FALSE_ALARM');

-- CreateEnum
CREATE TYPE "SosSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SosResponseType" AS ENUM ('VIEWED', 'CONFIRM_SAFE', 'NEED_HELP', 'RESOLVED', 'CANCELED');

-- CreateEnum
CREATE TYPE "WearableDeviceType" AS ENUM ('SMARTWATCH', 'GPS_TRACKER', 'BLE_DEVICE', 'SIMULATED_DEVICE');

-- CreateEnum
CREATE TYPE "DevicePairingStatus" AS ENUM ('PAIRED', 'UNPAIRED', 'LOST');

-- CreateEnum
CREATE TYPE "GpsSourceType" AS ENUM ('MOBILE_GPS', 'WEARABLE_GPS', 'SIMULATED_GPS');

-- CreateEnum
CREATE TYPE "SensorEventType" AS ENUM ('SOS_BUTTON_PRESSED', 'FALL_DETECTED', 'HARD_IMPACT', 'ABNORMAL_MOVEMENT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SOS', 'GENERAL');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "sos_settings" (
    "sos_setting_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "notify_all_members" BOOLEAN NOT NULL DEFAULT true,
    "auto_create_alert_from_fall" BOOLEAN NOT NULL DEFAULT false,
    "location_required" BOOLEAN NOT NULL DEFAULT true,
    "created_by_member_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sos_settings_pkey" PRIMARY KEY ("sos_setting_id")
);

-- CreateTable
CREATE TABLE "emergency_contacts" (
    "contact_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sos_setting_id" UUID NOT NULL,
    "contact_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "relationship_note" TEXT,
    "priority_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("contact_id")
);

-- CreateTable
CREATE TABLE "wearable_devices" (
    "device_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" TEXT NOT NULL,
    "owner_member_id" TEXT NOT NULL,
    "device_name" TEXT NOT NULL,
    "device_type" "WearableDeviceType" NOT NULL,
    "device_identifier" TEXT NOT NULL,
    "pairing_status" "DevicePairingStatus" NOT NULL,
    "gps_enabled" BOOLEAN NOT NULL,
    "sos_enabled" BOOLEAN NOT NULL,
    "last_seen_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wearable_devices_pkey" PRIMARY KEY ("device_id")
);

-- CreateTable
CREATE TABLE "sos_alerts" (
    "sos_alert_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" TEXT NOT NULL,
    "triggered_by_member_id" TEXT NOT NULL,
    "device_id" UUID,
    "source_type" "SosSourceType" NOT NULL,
    "status" "SosAlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "severity" "SosSeverity",
    "initial_latitude" DECIMAL(10,7),
    "initial_longitude" DECIMAL(10,7),
    "message" TEXT,
    "triggered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_by_member_id" TEXT,
    "resolved_at" TIMESTAMPTZ,
    "resolution_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sos_alerts_pkey" PRIMARY KEY ("sos_alert_id")
);

-- CreateTable
CREATE TABLE "sos_location_points" (
    "location_point_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sos_alert_id" UUID NOT NULL,
    "device_id" UUID,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "accuracy" DECIMAL(10,2),
    "source_type" "GpsSourceType" NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sos_location_points_pkey" PRIMARY KEY ("location_point_id")
);

-- CreateTable
CREATE TABLE "sos_responses" (
    "response_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sos_alert_id" UUID NOT NULL,
    "responder_member_id" TEXT NOT NULL,
    "response_type" "SosResponseType" NOT NULL,
    "message" TEXT,
    "responded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sos_responses_pkey" PRIMARY KEY ("response_id")
);

-- CreateTable
CREATE TABLE "sensor_events" (
    "sensor_event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" UUID NOT NULL,
    "event_type" "SensorEventType" NOT NULL,
    "raw_value" JSONB,
    "severity" "SosSeverity",
    "detected_at" TIMESTAMPTZ NOT NULL,
    "created_sos_alert_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensor_events_pkey" PRIMARY KEY ("sensor_event_id")
);

-- CreateTable
CREATE TABLE "member_location_points" (
    "location_point_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "device_id" UUID,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "accuracy" DECIMAL(10,2),
    "source_type" "GpsSourceType" NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_location_points_pkey" PRIMARY KEY ("location_point_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "notification_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" TEXT NOT NULL,
    "recipient_member_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sos_settings_workspace_id_key" ON "sos_settings"("workspace_id");

-- CreateIndex
CREATE INDEX "sos_settings_created_by_member_id_idx" ON "sos_settings"("created_by_member_id");

-- CreateIndex
CREATE INDEX "emergency_contacts_sos_setting_id_idx" ON "emergency_contacts"("sos_setting_id");

-- CreateIndex
CREATE INDEX "wearable_devices_workspace_id_idx" ON "wearable_devices"("workspace_id");

-- CreateIndex
CREATE INDEX "wearable_devices_owner_member_id_idx" ON "wearable_devices"("owner_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "wearable_devices_workspace_id_device_identifier_key" ON "wearable_devices"("workspace_id", "device_identifier");

-- CreateIndex
CREATE INDEX "sos_alerts_workspace_id_idx" ON "sos_alerts"("workspace_id");

-- CreateIndex
CREATE INDEX "sos_alerts_triggered_by_member_id_idx" ON "sos_alerts"("triggered_by_member_id");

-- CreateIndex
CREATE INDEX "sos_alerts_device_id_idx" ON "sos_alerts"("device_id");

-- CreateIndex
CREATE INDEX "sos_alerts_status_idx" ON "sos_alerts"("status");

-- CreateIndex
CREATE INDEX "sos_alerts_triggered_at_idx" ON "sos_alerts"("triggered_at");

-- CreateIndex
CREATE INDEX "sos_location_points_sos_alert_id_idx" ON "sos_location_points"("sos_alert_id");

-- CreateIndex
CREATE INDEX "sos_location_points_device_id_idx" ON "sos_location_points"("device_id");

-- CreateIndex
CREATE INDEX "sos_location_points_recorded_at_idx" ON "sos_location_points"("recorded_at");

-- CreateIndex
CREATE INDEX "sos_responses_sos_alert_id_idx" ON "sos_responses"("sos_alert_id");

-- CreateIndex
CREATE INDEX "sos_responses_responder_member_id_idx" ON "sos_responses"("responder_member_id");

-- CreateIndex
CREATE INDEX "sensor_events_device_id_idx" ON "sensor_events"("device_id");

-- CreateIndex
CREATE INDEX "sensor_events_created_sos_alert_id_idx" ON "sensor_events"("created_sos_alert_id");

-- CreateIndex
CREATE INDEX "sensor_events_detected_at_idx" ON "sensor_events"("detected_at");

-- CreateIndex
CREATE INDEX "member_location_points_workspace_id_idx" ON "member_location_points"("workspace_id");

-- CreateIndex
CREATE INDEX "member_location_points_member_id_idx" ON "member_location_points"("member_id");

-- CreateIndex
CREATE INDEX "member_location_points_device_id_idx" ON "member_location_points"("device_id");

-- CreateIndex
CREATE INDEX "member_location_points_recorded_at_idx" ON "member_location_points"("recorded_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_member_id_is_read_idx" ON "notifications"("recipient_member_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_family_id_idx" ON "notifications"("family_id");

-- AddForeignKey
ALTER TABLE "sos_settings" ADD CONSTRAINT "sos_settings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sos_settings" ADD CONSTRAINT "sos_settings_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_sos_setting_id_fkey" FOREIGN KEY ("sos_setting_id") REFERENCES "sos_settings"("sos_setting_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wearable_devices" ADD CONSTRAINT "wearable_devices_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wearable_devices" ADD CONSTRAINT "wearable_devices_owner_member_id_fkey" FOREIGN KEY ("owner_member_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sos_alerts" ADD CONSTRAINT "sos_alerts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sos_alerts" ADD CONSTRAINT "sos_alerts_triggered_by_member_id_fkey" FOREIGN KEY ("triggered_by_member_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sos_alerts" ADD CONSTRAINT "sos_alerts_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "wearable_devices"("device_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sos_alerts" ADD CONSTRAINT "sos_alerts_resolved_by_member_id_fkey" FOREIGN KEY ("resolved_by_member_id") REFERENCES "family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sos_location_points" ADD CONSTRAINT "sos_location_points_sos_alert_id_fkey" FOREIGN KEY ("sos_alert_id") REFERENCES "sos_alerts"("sos_alert_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sos_location_points" ADD CONSTRAINT "sos_location_points_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "wearable_devices"("device_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sos_responses" ADD CONSTRAINT "sos_responses_sos_alert_id_fkey" FOREIGN KEY ("sos_alert_id") REFERENCES "sos_alerts"("sos_alert_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sos_responses" ADD CONSTRAINT "sos_responses_responder_member_id_fkey" FOREIGN KEY ("responder_member_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensor_events" ADD CONSTRAINT "sensor_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "wearable_devices"("device_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensor_events" ADD CONSTRAINT "sensor_events_created_sos_alert_id_fkey" FOREIGN KEY ("created_sos_alert_id") REFERENCES "sos_alerts"("sos_alert_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_location_points" ADD CONSTRAINT "member_location_points_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_location_points" ADD CONSTRAINT "member_location_points_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_location_points" ADD CONSTRAINT "member_location_points_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "wearable_devices"("device_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_member_id_fkey" FOREIGN KEY ("recipient_member_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Manual constraints not expressible in schema.prisma (kept in this migration):

-- Partial unique index: at most one PAIRED + SOS-enabled device per member.
CREATE UNIQUE INDEX "wearable_devices_owner_active_unique"
    ON "wearable_devices"("owner_member_id")
    WHERE "pairing_status" = 'PAIRED' AND "sos_enabled" = true;

-- Coordinate sanity checks on everyday member location tracking.
ALTER TABLE "member_location_points"
    ADD CONSTRAINT "member_location_points_latitude_check"
    CHECK ("latitude" BETWEEN -90 AND 90);

ALTER TABLE "member_location_points"
    ADD CONSTRAINT "member_location_points_longitude_check"
    CHECK ("longitude" BETWEEN -180 AND 180);
