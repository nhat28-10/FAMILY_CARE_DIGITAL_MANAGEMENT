CREATE TYPE "FaceScanJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "AlbumFaceDetectionStatus" AS ENUM ('MATCHED', 'UNMATCHED', 'SUPERSEDED');
CREATE TYPE "AlbumTagSuggestionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED');

CREATE TABLE "face_scan_jobs" (
  "scan_job_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" TEXT NOT NULL,
  "media_id" UUID NOT NULL,
  "requested_by_member_id" TEXT NOT NULL,
  "status" "FaceScanJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "face_scan_jobs_pkey" PRIMARY KEY ("scan_job_id")
);

CREATE TABLE "album_face_detections" (
  "detection_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" TEXT NOT NULL,
  "scan_job_id" UUID NOT NULL,
  "media_id" UUID NOT NULL,
  "face_index" INTEGER NOT NULL,
  "bounding_box" JSONB NOT NULL,
  "detection_score" DECIMAL(5,4),
  "quality_score" DECIMAL(5,4),
  "model_name" TEXT NOT NULL,
  "model_version" TEXT NOT NULL,
  "status" "AlbumFaceDetectionStatus" NOT NULL DEFAULT 'UNMATCHED',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "album_face_detections_pkey" PRIMARY KEY ("detection_id")
);

CREATE TABLE "album_tag_suggestions" (
  "suggestion_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" TEXT NOT NULL,
  "detection_id" UUID NOT NULL,
  "media_id" UUID NOT NULL,
  "suggested_member_id" TEXT NOT NULL,
  "similarity_score" DECIMAL(5,4) NOT NULL,
  "second_best_score" DECIMAL(5,4),
  "score_margin" DECIMAL(5,4),
  "status" "AlbumTagSuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "confirmed_by_member_id" TEXT,
  "confirmed_at" TIMESTAMPTZ,
  "rejected_by_member_id" TEXT,
  "rejected_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "album_tag_suggestions_pkey" PRIMARY KEY ("suggestion_id")
);

CREATE INDEX "face_scan_jobs_workspace_id_idx" ON "face_scan_jobs"("workspace_id");
CREATE INDEX "face_scan_jobs_media_id_idx" ON "face_scan_jobs"("media_id");
CREATE INDEX "face_scan_jobs_workspace_id_media_id_created_at_idx" ON "face_scan_jobs"("workspace_id", "media_id", "created_at");
CREATE INDEX "face_scan_jobs_status_started_at_idx" ON "face_scan_jobs"("status", "started_at");
CREATE UNIQUE INDEX "face_scan_jobs_one_active_per_media_idx"
  ON "face_scan_jobs"("workspace_id", "media_id")
  WHERE "status" IN ('PENDING', 'PROCESSING');

CREATE UNIQUE INDEX "album_face_detections_scan_job_id_face_index_key"
  ON "album_face_detections"("scan_job_id", "face_index");
CREATE INDEX "album_face_detections_workspace_id_idx" ON "album_face_detections"("workspace_id");
CREATE INDEX "album_face_detections_media_id_idx" ON "album_face_detections"("media_id");
CREATE INDEX "album_face_detections_workspace_id_media_id_idx" ON "album_face_detections"("workspace_id", "media_id");

CREATE UNIQUE INDEX "album_tag_suggestions_detection_id_suggested_member_id_key"
  ON "album_tag_suggestions"("detection_id", "suggested_member_id");
CREATE INDEX "album_tag_suggestions_workspace_id_idx" ON "album_tag_suggestions"("workspace_id");
CREATE INDEX "album_tag_suggestions_media_id_idx" ON "album_tag_suggestions"("media_id");
CREATE INDEX "album_tag_suggestions_workspace_id_media_id_idx" ON "album_tag_suggestions"("workspace_id", "media_id");
CREATE INDEX "album_tag_suggestions_suggested_member_id_status_idx" ON "album_tag_suggestions"("suggested_member_id", "status");

ALTER TABLE "face_scan_jobs"
  ADD CONSTRAINT "face_scan_jobs_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "families"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "face_scan_jobs"
  ADD CONSTRAINT "face_scan_jobs_media_id_fkey"
  FOREIGN KEY ("media_id") REFERENCES "album_media"("media_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "face_scan_jobs"
  ADD CONSTRAINT "face_scan_jobs_requested_by_member_id_fkey"
  FOREIGN KEY ("requested_by_member_id") REFERENCES "family_members"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "album_face_detections"
  ADD CONSTRAINT "album_face_detections_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "families"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "album_face_detections"
  ADD CONSTRAINT "album_face_detections_scan_job_id_fkey"
  FOREIGN KEY ("scan_job_id") REFERENCES "face_scan_jobs"("scan_job_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "album_face_detections"
  ADD CONSTRAINT "album_face_detections_media_id_fkey"
  FOREIGN KEY ("media_id") REFERENCES "album_media"("media_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "album_tag_suggestions"
  ADD CONSTRAINT "album_tag_suggestions_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "families"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "album_tag_suggestions"
  ADD CONSTRAINT "album_tag_suggestions_detection_id_fkey"
  FOREIGN KEY ("detection_id") REFERENCES "album_face_detections"("detection_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "album_tag_suggestions"
  ADD CONSTRAINT "album_tag_suggestions_media_id_fkey"
  FOREIGN KEY ("media_id") REFERENCES "album_media"("media_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "album_tag_suggestions"
  ADD CONSTRAINT "album_tag_suggestions_suggested_member_id_fkey"
  FOREIGN KEY ("suggested_member_id") REFERENCES "family_members"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "album_tag_suggestions"
  ADD CONSTRAINT "album_tag_suggestions_confirmed_by_member_id_fkey"
  FOREIGN KEY ("confirmed_by_member_id") REFERENCES "family_members"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "album_tag_suggestions"
  ADD CONSTRAINT "album_tag_suggestions_rejected_by_member_id_fkey"
  FOREIGN KEY ("rejected_by_member_id") REFERENCES "family_members"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
