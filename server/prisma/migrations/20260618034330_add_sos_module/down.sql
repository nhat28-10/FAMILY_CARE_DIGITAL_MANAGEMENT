-- Manual rollback for migration `20260618034330_add_sos_module`.
-- Prisma migrations are forward-only (no native `down`). Use this script only
-- for an intentional manual rollback (e.g. production hotfix). In local dev,
-- prefer `npx prisma migrate reset`.
--
-- Run inside a transaction. Tables are dropped child-first; CASCADE also removes
-- their FKs/indexes/constraints. Enums are dropped last (after dependent tables).

BEGIN;

DROP TABLE IF EXISTS "member_location_points" CASCADE;
DROP TABLE IF EXISTS "sensor_events" CASCADE;
DROP TABLE IF EXISTS "sos_responses" CASCADE;
DROP TABLE IF EXISTS "sos_location_points" CASCADE;
DROP TABLE IF EXISTS "sos_alerts" CASCADE;
DROP TABLE IF EXISTS "wearable_devices" CASCADE;
DROP TABLE IF EXISTS "emergency_contacts" CASCADE;
DROP TABLE IF EXISTS "sos_settings" CASCADE;
DROP TABLE IF EXISTS "notifications" CASCADE;

DROP TYPE IF EXISTS "NotificationPriority";
DROP TYPE IF EXISTS "NotificationType";
DROP TYPE IF EXISTS "SensorEventType";
DROP TYPE IF EXISTS "GpsSourceType";
DROP TYPE IF EXISTS "DevicePairingStatus";
DROP TYPE IF EXISTS "WearableDeviceType";
DROP TYPE IF EXISTS "SosResponseType";
DROP TYPE IF EXISTS "SosSeverity";
DROP TYPE IF EXISTS "SosAlertStatus";
DROP TYPE IF EXISTS "SosSourceType";

-- Note: the `pgcrypto` extension is intentionally NOT dropped — other features
-- may rely on gen_random_uuid().

COMMIT;
