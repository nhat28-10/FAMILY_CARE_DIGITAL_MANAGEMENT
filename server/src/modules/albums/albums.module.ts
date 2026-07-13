import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { FamilyMembersModule } from '../family-members/family-members.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { UsersModule } from '../users/users.module';
import { AlbumMediaPolicy } from './album-media.policy';
import { AlbumStorageCleanupService } from './album-storage-cleanup.service';
import { AlbumTagsController } from './album-tags.controller';
import { AlbumTagsService } from './album-tags.service';
import { AlbumModerationController } from './album-moderation.controller';
import { AlbumsController } from './albums.controller';
import { AlbumsService } from './albums.service';
import { AlbumModerationConsumer } from './moderation/album-moderation.consumer';
import { AlbumModerationRecoveryService } from './moderation/album-moderation-recovery.service';
import { AlbumModerationService } from './moderation/album-moderation.service';
import { CloudflareQueueService } from './moderation/cloudflare-queue.service';
import { CloudflareWorkersAiService } from './moderation/cloudflare-workers-ai.service';
import { VideoFrameService } from './moderation/video-frame.service';

@Module({
  imports: [
    JwtModule.register({}),
    UsersModule,
    FamilyMembersModule,
    NotificationsModule,
    StorageModule,
  ],
  controllers: [
    AlbumsController,
    AlbumTagsController,
    AlbumModerationController,
  ],
  providers: [
    AlbumsService,
    AlbumTagsService,
    AlbumStorageCleanupService,
    AlbumMediaPolicy,
    CloudflareQueueService,
    CloudflareWorkersAiService,
    VideoFrameService,
    AlbumModerationService,
    AlbumModerationConsumer,
    AlbumModerationRecoveryService,
  ],
  exports: [AlbumsService, AlbumModerationService],
})
export class AlbumsModule {}
