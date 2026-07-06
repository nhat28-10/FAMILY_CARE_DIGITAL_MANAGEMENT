-- CreateEnum
CREATE TYPE "ProvisioningActionType" AS ENUM ('CREATE', 'ACTIVATE', 'RETRY', 'SUSPEND');

-- CreateEnum
CREATE TYPE "ProvisioningStatus" AS ENUM ('SUCCESS', 'FAILED', 'PENDING');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('GROUP', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('ACTIVE', 'LEFT');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'LOCATION', 'SOS_QUICK_MESSAGE');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CalendarEventStatus" AS ENUM ('ACTIVE', 'CANCELED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EventResponseStatus" AS ENUM ('INVITED', 'ACCEPTED', 'DECLINED', 'MAYBE');

-- CreateEnum
CREATE TYPE "AlbumMediaType" AS ENUM ('PHOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "AlbumVisibilityScope" AS ENUM ('FAMILY', 'PRIVATE');

-- CreateEnum
CREATE TYPE "MediaModerationStatus" AS ENUM ('PENDING', 'SAFE', 'FLAGGED');

-- CreateEnum
CREATE TYPE "MediaCheckType" AS ENUM ('SENSITIVE_CONTENT', 'FACE_GROUPING');

-- CreateEnum
CREATE TYPE "MediaCheckResult" AS ENUM ('SAFE', 'FLAGGED', 'NEED_REVIEW');

-- CreateEnum
CREATE TYPE "AiSenderType" AS ENUM ('USER', 'AI');

-- CreateEnum
CREATE TYPE "AiRelatedModule" AS ENUM ('FINANCE', 'TASK', 'SOS', 'CALENDAR', 'GENERAL');

-- CreateTable
CREATE TABLE "workspace_provisioning_logs" (
    "provisioning_log_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" TEXT NOT NULL,
    "action_type" "ProvisioningActionType" NOT NULL,
    "status" "ProvisioningStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_provisioning_logs_pkey" PRIMARY KEY ("provisioning_log_id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "conversation_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" TEXT NOT NULL,
    "conversation_type" "ConversationType" NOT NULL DEFAULT 'GROUP',
    "conversation_name" TEXT,
    "created_by_member_id" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("conversation_id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "participant_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "member_id" TEXT NOT NULL,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ,
    "participant_status" "ParticipantStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("participant_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "message_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "sender_member_id" TEXT NOT NULL,
    "message_type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "attachment_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "message_id" UUID NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT,
    "file_size" INTEGER,
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("attachment_id")
);

-- CreateTable
CREATE TABLE "family_announcements" (
    "announcement_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" TEXT NOT NULL,
    "created_by_member_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_announcements_pkey" PRIMARY KEY ("announcement_id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "start_time" TIMESTAMPTZ NOT NULL,
    "end_time" TIMESTAMPTZ,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "created_by_member_id" TEXT NOT NULL,
    "status" "CalendarEventStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "calendar_event_participants" (
    "event_participant_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "member_id" TEXT NOT NULL,
    "response_status" "EventResponseStatus" NOT NULL DEFAULT 'INVITED',
    "reminder_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "calendar_event_participants_pkey" PRIMARY KEY ("event_participant_id")
);

-- CreateTable
CREATE TABLE "album_media" (
    "media_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" TEXT NOT NULL,
    "uploaded_by_member_id" TEXT NOT NULL,
    "media_type" "AlbumMediaType" NOT NULL,
    "media_url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "caption" TEXT,
    "visibility_scope" "AlbumVisibilityScope" NOT NULL DEFAULT 'FAMILY',
    "moderation_status" "MediaModerationStatus" NOT NULL DEFAULT 'PENDING',
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "album_media_pkey" PRIMARY KEY ("media_id")
);

-- CreateTable
CREATE TABLE "album_media_tags" (
    "tag_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "media_id" UUID NOT NULL,
    "tagged_member_id" TEXT NOT NULL,
    "tagged_by_member_id" TEXT NOT NULL,
    "tag_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "album_media_tags_pkey" PRIMARY KEY ("tag_id")
);

-- CreateTable
CREATE TABLE "media_moderation_checks" (
    "moderation_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "media_id" UUID NOT NULL,
    "check_type" "MediaCheckType" NOT NULL,
    "result_status" "MediaCheckResult" NOT NULL,
    "confidence_score" DECIMAL(5,4),
    "checked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_moderation_checks_pkey" PRIMARY KEY ("moderation_id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "ai_conversation_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "conversation_title" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("ai_conversation_id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "ai_message_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ai_conversation_id" UUID NOT NULL,
    "sender_type" "AiSenderType" NOT NULL,
    "message_content" TEXT NOT NULL,
    "related_module" "AiRelatedModule",
    "permission_context" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("ai_message_id")
);

-- CreateIndex
CREATE INDEX "workspace_provisioning_logs_workspace_id_idx" ON "workspace_provisioning_logs"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_provisioning_logs_created_by_user_id_idx" ON "workspace_provisioning_logs"("created_by_user_id");

-- CreateIndex
CREATE INDEX "workspace_provisioning_logs_status_idx" ON "workspace_provisioning_logs"("status");

-- CreateIndex
CREATE INDEX "conversations_workspace_id_idx" ON "conversations"("workspace_id");

-- CreateIndex
CREATE INDEX "conversations_created_by_member_id_idx" ON "conversations"("created_by_member_id");

-- CreateIndex
CREATE INDEX "conversation_participants_conversation_id_idx" ON "conversation_participants"("conversation_id");

-- CreateIndex
CREATE INDEX "conversation_participants_member_id_idx" ON "conversation_participants"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_conversation_id_member_id_key" ON "conversation_participants"("conversation_id", "member_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_sent_at_idx" ON "messages"("conversation_id", "sent_at");

-- CreateIndex
CREATE INDEX "messages_sender_member_id_idx" ON "messages"("sender_member_id");

-- CreateIndex
CREATE INDEX "message_attachments_message_id_idx" ON "message_attachments"("message_id");

-- CreateIndex
CREATE INDEX "family_announcements_workspace_id_idx" ON "family_announcements"("workspace_id");

-- CreateIndex
CREATE INDEX "family_announcements_created_by_member_id_idx" ON "family_announcements"("created_by_member_id");

-- CreateIndex
CREATE INDEX "calendar_events_workspace_id_idx" ON "calendar_events"("workspace_id");

-- CreateIndex
CREATE INDEX "calendar_events_created_by_member_id_idx" ON "calendar_events"("created_by_member_id");

-- CreateIndex
CREATE INDEX "calendar_events_start_time_idx" ON "calendar_events"("start_time");

-- CreateIndex
CREATE INDEX "calendar_event_participants_event_id_idx" ON "calendar_event_participants"("event_id");

-- CreateIndex
CREATE INDEX "calendar_event_participants_member_id_idx" ON "calendar_event_participants"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_event_participants_event_id_member_id_key" ON "calendar_event_participants"("event_id", "member_id");

-- CreateIndex
CREATE INDEX "album_media_workspace_id_idx" ON "album_media"("workspace_id");

-- CreateIndex
CREATE INDEX "album_media_uploaded_by_member_id_idx" ON "album_media"("uploaded_by_member_id");

-- CreateIndex
CREATE INDEX "album_media_moderation_status_idx" ON "album_media"("moderation_status");

-- CreateIndex
CREATE INDEX "album_media_tags_media_id_idx" ON "album_media_tags"("media_id");

-- CreateIndex
CREATE INDEX "album_media_tags_tagged_member_id_idx" ON "album_media_tags"("tagged_member_id");

-- CreateIndex
CREATE INDEX "album_media_tags_tagged_by_member_id_idx" ON "album_media_tags"("tagged_by_member_id");

-- CreateIndex
CREATE INDEX "media_moderation_checks_media_id_idx" ON "media_moderation_checks"("media_id");

-- CreateIndex
CREATE INDEX "media_moderation_checks_check_type_idx" ON "media_moderation_checks"("check_type");

-- CreateIndex
CREATE INDEX "ai_conversations_workspace_id_idx" ON "ai_conversations"("workspace_id");

-- CreateIndex
CREATE INDEX "ai_conversations_member_id_idx" ON "ai_conversations"("member_id");

-- CreateIndex
CREATE INDEX "ai_messages_ai_conversation_id_idx" ON "ai_messages"("ai_conversation_id");

-- AddForeignKey
ALTER TABLE "workspace_provisioning_logs" ADD CONSTRAINT "workspace_provisioning_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_provisioning_logs" ADD CONSTRAINT "workspace_provisioning_logs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("conversation_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("conversation_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_member_id_fkey" FOREIGN KEY ("sender_member_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("message_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_announcements" ADD CONSTRAINT "family_announcements_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_announcements" ADD CONSTRAINT "family_announcements_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_participants" ADD CONSTRAINT "calendar_event_participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "calendar_events"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_participants" ADD CONSTRAINT "calendar_event_participants_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_media" ADD CONSTRAINT "album_media_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_media" ADD CONSTRAINT "album_media_uploaded_by_member_id_fkey" FOREIGN KEY ("uploaded_by_member_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_media_tags" ADD CONSTRAINT "album_media_tags_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "album_media"("media_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_media_tags" ADD CONSTRAINT "album_media_tags_tagged_member_id_fkey" FOREIGN KEY ("tagged_member_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_media_tags" ADD CONSTRAINT "album_media_tags_tagged_by_member_id_fkey" FOREIGN KEY ("tagged_by_member_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_moderation_checks" ADD CONSTRAINT "media_moderation_checks_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "album_media"("media_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_ai_conversation_id_fkey" FOREIGN KEY ("ai_conversation_id") REFERENCES "ai_conversations"("ai_conversation_id") ON DELETE CASCADE ON UPDATE CASCADE;
