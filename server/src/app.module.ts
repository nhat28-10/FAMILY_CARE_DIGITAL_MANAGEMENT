import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import configuration from './config/configuration';
import { typeOrmConfig } from './database/typeorm.config';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { FamiliesModule } from './modules/families/families.module';
import { FamilyMembersModule } from './modules/family-members/family-members.module';
import { RolesPermissionsModule } from './modules/roles-permissions/roles-permissions.module';
import { SubscriptionPlansModule } from './modules/subscription-plans/subscription-plans.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { RewardsModule } from './modules/rewards/rewards.module';
import { ChatsModule } from './modules/chats/chats.module';
import { MessagesModule } from './modules/messages/messages.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SosModule } from './modules/sos/sos.module';
import { LocationsModule } from './modules/locations/locations.module';
import { DevicesModule } from './modules/devices/devices.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { AlbumsModule } from './modules/albums/albums.module';
import { AiChatbotModule } from './modules/ai-chatbot/ai-chatbot.module';
import { AdminModule } from './modules/admin/admin.module';

const env = process.env.NODE_ENV || process.env.APP_ENV || 'local';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${env}`, '.env'],
      load: [configuration],
    }),

    TypeOrmModule.forRoot(typeOrmConfig()),

    AuthModule,
    UsersModule,
    FamiliesModule,
    FamilyMembersModule,
    RolesPermissionsModule,
    SubscriptionPlansModule,
    SubscriptionsModule,
    WalletsModule,
    TransactionsModule,
    TasksModule,
    RewardsModule,
    ChatsModule,
    MessagesModule,
    NotificationsModule,
    SosModule,
    LocationsModule,
    DevicesModule,
    CalendarModule,
    AlbumsModule,
    AiChatbotModule,
    AdminModule,
  ],
})
export class AppModule {}
