import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './modules/mail/mail.module';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { FamiliesModule } from './modules/families/families.module';
import { FamilyMembersModule } from './modules/family-members/family-members.module';
import { FinanceModule } from './modules/finance/finance.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { RolesPermissionsModule } from './modules/roles-permissions/roles-permissions.module';
import { SubscriptionPlansModule } from './modules/subscription-plans/subscription-plans.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { BillingsModule } from './modules/billing/billings.module';

import { TasksModule } from './modules/tasks/tasks.module';
import { RewardsModule } from './modules/rewards/rewards.module';
import { ChatsModule } from './modules/chats/chats.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SosModule } from './modules/sos/sos.module';
import { LocationsModule } from './modules/locations/locations.module';
import { DevicesModule } from './modules/devices/devices.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { AlbumsModule } from './modules/albums/albums.module';
import { AiChatbotModule } from './modules/ai-chatbot/ai-chatbot.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            // @nestjs/throttler dùng ttl theo MILLIGIÂY.
            ttl: config.get<number>('throttle.ttl', 60) * 1000,
            limit: config.get<number>('throttle.limit', 100),
          },
        ],
      }),
    }),
    ScheduleModule.forRoot(),

    PrismaModule,
    MailModule,

    AuthModule,
    UsersModule,
    FamiliesModule,
    FamilyMembersModule,
    FinanceModule,
    InvitationsModule,
    RolesPermissionsModule,
    SubscriptionPlansModule,
    SubscriptionsModule,
    BillingsModule,
    TasksModule,
    RewardsModule,
    ChatsModule,
    NotificationsModule,
    SosModule,
    LocationsModule,
    DevicesModule,
    CalendarModule,
    AlbumsModule,
    AiChatbotModule,
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
