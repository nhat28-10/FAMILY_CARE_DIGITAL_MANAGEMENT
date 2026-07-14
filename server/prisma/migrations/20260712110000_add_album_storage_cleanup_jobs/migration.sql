CREATE TYPE "StorageCleanupStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TYPE "StorageCleanupReason" AS ENUM ('ORPHAN_UPLOAD', 'PERMANENT_DELETE_RETRY', 'PERMANENT_DELETE_DB_FAILED');

CREATE TABLE "storage_cleanup_jobs" (
  "cleanup_job_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" TEXT,
  "media_id" UUID,
  "storage_key" TEXT NOT NULL,
  "reason" "StorageCleanupReason" NOT NULL,
  "status" "StorageCleanupStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "next_retry_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "storage_cleanup_jobs_pkey" PRIMARY KEY ("cleanup_job_id")
);

CREATE UNIQUE INDEX "storage_cleanup_jobs_storage_key_key"
  ON "storage_cleanup_jobs"("storage_key");
CREATE INDEX "storage_cleanup_jobs_status_next_retry_at_idx"
  ON "storage_cleanup_jobs"("status", "next_retry_at");
CREATE INDEX "storage_cleanup_jobs_workspace_id_idx"
  ON "storage_cleanup_jobs"("workspace_id");
CREATE INDEX "storage_cleanup_jobs_media_id_idx"
  ON "storage_cleanup_jobs"("media_id");

ALTER TABLE "storage_cleanup_jobs"
  ADD CONSTRAINT "storage_cleanup_jobs_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "families"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "storage_cleanup_jobs"
  ADD CONSTRAINT "storage_cleanup_jobs_media_id_fkey"
  FOREIGN KEY ("media_id") REFERENCES "album_media"("media_id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "album_media_moderation_status_moderation_queued_at_idx"
  ON "album_media"("moderation_status", "moderation_queued_at");
CREATE INDEX "media_moderation_checks_media_id_checked_at_idx"
  ON "media_moderation_checks"("media_id", "checked_at");
