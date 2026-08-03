-- Enforce the business rule at user-account level:
-- one user account can have at most one paired wearable across all families.

ALTER TABLE "wearable_devices" ADD COLUMN IF NOT EXISTS "owner_user_id" TEXT;

UPDATE "wearable_devices" AS wd
SET "owner_user_id" = fm."userId"
FROM "family_members" AS fm
WHERE wd."owner_member_id" = fm."id";

ALTER TABLE "wearable_devices" ALTER COLUMN "owner_user_id" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wearable_devices_owner_user_id_fkey'
  ) THEN
    ALTER TABLE "wearable_devices"
    ADD CONSTRAINT "wearable_devices_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "wearable_devices_owner_user_id_idx"
ON "wearable_devices"("owner_user_id");

DROP INDEX IF EXISTS "wearable_devices_owner_active_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "wearable_devices_owner_user_paired_unique"
ON "wearable_devices"("owner_user_id")
WHERE "pairing_status" = 'PAIRED';
