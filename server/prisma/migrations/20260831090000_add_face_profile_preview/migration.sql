ALTER TABLE "member_face_profiles"
  ADD COLUMN "preview_storage_key" TEXT,
  ADD COLUMN "preview_original_name" TEXT,
  ADD COLUMN "preview_mime_type" TEXT,
  ADD COLUMN "preview_file_size" INTEGER;
