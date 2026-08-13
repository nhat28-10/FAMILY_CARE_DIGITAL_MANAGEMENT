import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ChatsModule } from '../chats/chats.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CallsProcessor } from './calls.processor';
import { CALLS_QUEUE } from './calls.types';
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
  imports: [
    ChatsModule,
    NotificationsModule,
    BullModule.registerQueue({
      name: CALLS_QUEUE,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    }),
  ],
  controllers: [CallsController, CallsWebhookController],
  providers: [CallsService, LiveKitService, CallsProcessor],
})
export class CallsModule {}
