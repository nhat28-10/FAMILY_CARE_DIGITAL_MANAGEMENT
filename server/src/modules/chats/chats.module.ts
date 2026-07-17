import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { FamilyMembersModule } from '../family-members/family-members.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { UsersModule } from '../users/users.module';
import { ChatsGateway } from './chats.gateway';
import { ConversationsController } from './controllers/conversations.controller';
import { MessagesController } from './controllers/messages.controller';
import { ConversationsService } from './services/conversations.service';
import { MessagesService } from './services/messages.service';

/**
 * Chat gia đình: nhóm chung mặc định + nhóm tùy chỉnh + chat 1-1, realtime qua
 * namespace `/chat` (xem ChatsGateway). File đính kèm upload lên R2 (StorageModule).
 */
@Module({
  imports: [
    JwtModule.register({}),
    UsersModule,
    FamilyMembersModule,
    StorageModule,
    NotificationsModule,
  ],
  controllers: [ConversationsController, MessagesController],
  providers: [ConversationsService, MessagesService, ChatsGateway],
  exports: [ConversationsService, MessagesService],
})
export class ChatsModule {}
