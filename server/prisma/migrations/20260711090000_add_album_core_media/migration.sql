-- Extend album enums for manager-only visibility and Phase 2 moderation readiness.
ALTER TYPE "AlbumVisibilityScope" ADD VALUE IF NOT EXISTS 'MANAGER_ONLY';
ALTER TYPE "MediaModerationStatus" ADD VALUE IF NOT EXISTS 'NEED_REVIEW';

-- Preserve legacy public URL rows while new media is stored by private R2 key.
ALTER TABLE "album_media"
  ALTER COLUMN "media_url" DROP NOT NULL,
  ADD COLUMN "storage_key" TEXT,
  ADD COLUMN "original_file_name" TEXT,
  ADD COLUMN "mime_type" TEXT,
  ADD COLUMN "file_size" INTEGER,
  ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "deleted_at" TIMESTAMPTZ,
  ADD COLUMN "deleted_by_member_id" TEXT,
  ADD COLUMN "delete_reason" TEXT;

ALTER TABLE "album_media"
  ADD CONSTRAINT "album_media_deleted_by_member_id_fkey"
  FOREIGN KEY ("deleted_by_member_id") REFERENCES "family_members"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "album_media_workspace_id_uploaded_at_idx"
  ON "album_media"("workspace_id", "uploaded_at");
CREATE INDEX "album_media_workspace_id_deleted_at_uploaded_at_idx"
  ON "album_media"("workspace_id", "deleted_at", "uploaded_at");
CREATE INDEX "album_media_workspace_id_moderation_status_uploaded_at_idx"
  ON "album_media"("workspace_id", "moderation_status", "uploaded_at");
CREATE INDEX "album_media_deleted_by_member_id_idx"
  ON "album_media"("deleted_by_member_id");

CREATE UNIQUE INDEX "album_media_tags_media_id_tagged_member_id_key"
  ON "album_media_tags"("media_id", "tagged_member_id");
