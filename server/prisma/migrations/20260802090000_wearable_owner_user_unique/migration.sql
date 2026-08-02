-- Enforce the business rule at user-account level:
-- one user account can have at most one paired wearable across all families.

ALTER TABLE "wearable_devices" ADD COLUMN "owner_user_id" TEXT;

UPDATE "wearable_devices" AS wd
SET "owner_user_id" = fm."user_id"
FROM "family_members" AS fm
WHERE wd."owner_member_id" = fm."id";

ALTER TABLE "wearable_devices" ALTER COLUMN "owner_user_id" SET NOT NULL;

ALTER TABLE "wearable_devices"
ADD CONSTRAINT "wearable_devices_owner_user_id_fkey"
FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "wearable_devices_owner_user_id_idx"
ON "wearable_devices"("owner_user_id");

DROP INDEX IF EXISTS "wearable_devices_owner_active_unique";

CREATE UNIQUE INDEX "wearable_devices_owner_user_paired_unique"
ON "wearable_devices"("owner_user_id")
WHERE "pairing_status" = 'PAIRED';
