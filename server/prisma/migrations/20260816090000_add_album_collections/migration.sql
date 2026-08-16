-- AlterTable
ALTER TABLE "album_media" ADD COLUMN "collection_id" UUID;

-- CreateTable
CREATE TABLE "album_collections" (
    "collection_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cover_media_id" UUID,
    "created_by_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "album_collections_pkey" PRIMARY KEY ("collection_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "album_collections_workspace_id_name_key" ON "album_collections"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "album_collections_workspace_id_idx" ON "album_collections"("workspace_id");

-- CreateIndex
CREATE INDEX "album_collections_workspace_id_created_at_idx" ON "album_collections"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "album_collections_created_by_member_id_idx" ON "album_collections"("created_by_member_id");

-- CreateIndex
CREATE INDEX "album_media_workspace_id_collection_id_uploaded_at_idx" ON "album_media"("workspace_id", "collection_id", "uploaded_at");

-- AddForeignKey
ALTER TABLE "album_collections" ADD CONSTRAINT "album_collections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_collections" ADD CONSTRAINT "album_collections_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_collections" ADD CONSTRAINT "album_collections_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "album_media"("media_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_media" ADD CONSTRAINT "album_media_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "album_collections"("collection_id") ON DELETE SET NULL ON UPDATE CASCADE;
