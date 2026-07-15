CREATE TYPE "FaceProfileStatus" AS ENUM ('ACTIVE', 'DISABLED', 'DELETED');

CREATE TABLE "member_face_profiles" (
  "profile_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "status" "FaceProfileStatus" NOT NULL DEFAULT 'ACTIVE',
  "consented_at" TIMESTAMPTZ NOT NULL,
  "consented_by_member_id" TEXT NOT NULL,
  "model_name" TEXT NOT NULL,
  "model_version" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ,
  CONSTRAINT "member_face_profiles_pkey" PRIMARY KEY ("profile_id")
);

CREATE TABLE "member_face_embeddings" (
  "embedding_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "profile_id" UUID NOT NULL,
  "encrypted_embedding" BYTEA NOT NULL,
  "encryption_iv" BYTEA NOT NULL,
  "encryption_auth_tag" BYTEA NOT NULL,
  "embedding_dimension" INTEGER NOT NULL,
  "detection_score" DECIMAL(5,4),
  "quality_score" DECIMAL(5,4),
  "model_name" TEXT NOT NULL,
  "model_version" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ,
  CONSTRAINT "member_face_embeddings_pkey" PRIMARY KEY ("embedding_id")
);

CREATE UNIQUE INDEX "member_face_profiles_workspace_id_member_id_key"
  ON "member_face_profiles"("workspace_id", "member_id");
CREATE INDEX "member_face_profiles_workspace_id_idx"
  ON "member_face_profiles"("workspace_id");
CREATE INDEX "member_face_profiles_member_id_idx"
  ON "member_face_profiles"("member_id");
CREATE INDEX "member_face_profiles_consented_by_member_id_idx"
  ON "member_face_profiles"("consented_by_member_id");
CREATE INDEX "member_face_profiles_status_idx"
  ON "member_face_profiles"("status");

CREATE INDEX "member_face_embeddings_profile_id_idx"
  ON "member_face_embeddings"("profile_id");
CREATE INDEX "member_face_embeddings_profile_id_revoked_at_idx"
  ON "member_face_embeddings"("profile_id", "revoked_at");

ALTER TABLE "member_face_profiles"
  ADD CONSTRAINT "member_face_profiles_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "families"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_face_profiles"
  ADD CONSTRAINT "member_face_profiles_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "family_members"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_face_profiles"
  ADD CONSTRAINT "member_face_profiles_consented_by_member_id_fkey"
  FOREIGN KEY ("consented_by_member_id") REFERENCES "family_members"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "member_face_embeddings"
  ADD CONSTRAINT "member_face_embeddings_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "member_face_profiles"("profile_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
