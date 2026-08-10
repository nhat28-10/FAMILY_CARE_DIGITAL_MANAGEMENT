import { Module } from '@nestjs/common';

import { ChatsModule } from '../chats/chats.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CallsWebhookController } from './controllers/calls-webhook.controller';
import { CallsController } from './controllers/calls.controller';
import { CallsService } from './services/calls.service';
import { LiveKitService } from './services/livekit.service';

/**
 * Video/audio call (LiveKit Cloud) gắn với Conversation của module `chats`.
 * Signaling ("có người gọi đến") đi qua `ChatsGateway` (room `conversation:<id>`
 * đã có sẵn) thay vì mở namespace WS riêng — xem `ChatsGateway.emitCall*`.
 */
@Module({
  imports: [ChatsModule, NotificationsModule],
  controllers: [CallsController, CallsWebhookController],
  providers: [CallsService, LiveKitService],
})
export class CallsModule {}
