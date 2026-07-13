ALTER TYPE "MediaModerationStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

ALTER TABLE "album_media"
  ADD COLUMN "moderation_started_at" TIMESTAMPTZ,
  ADD COLUMN "moderation_completed_at" TIMESTAMPTZ,
  ADD COLUMN "moderation_attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_moderation_error" TEXT,
  ADD COLUMN "latest_moderation_job_id" UUID,
  ADD COLUMN "moderation_queued_at" TIMESTAMPTZ;

CREATE INDEX "album_media_moderation_status_moderation_started_at_idx"
  ON "album_media"("moderation_status", "moderation_started_at");

ALTER TABLE "media_moderation_checks"
  ADD COLUMN "job_id" UUID,
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "model_name" TEXT,
  ADD COLUMN "categories" JSONB,
  ADD COLUMN "reason_code" TEXT,
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "error_code" TEXT,
  ADD COLUMN "error_message" TEXT,
  ADD COLUMN "reviewed_by_member_id" TEXT,
  ADD COLUMN "review_note" TEXT,
  ADD COLUMN "reviewed_at" TIMESTAMPTZ,
  ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "media_moderation_checks_job_id_key"
  ON "media_moderation_checks"("job_id");
CREATE INDEX "media_moderation_checks_reviewed_by_member_id_idx"
  ON "media_moderation_checks"("reviewed_by_member_id");

ALTER TABLE "media_moderation_checks"
  ADD CONSTRAINT "media_moderation_checks_reviewed_by_member_id_fkey"
  FOREIGN KEY ("reviewed_by_member_id") REFERENCES "family_members"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
