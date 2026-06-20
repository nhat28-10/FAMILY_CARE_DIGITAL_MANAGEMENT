import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AdminModule } from '../modules/admin/admin.module';
import { AiChatbotModule } from '../modules/ai-chatbot/ai-chatbot.module';
import { AlbumsModule } from '../modules/albums/albums.module';
import { AuthModule } from '../modules/auth/auth.module';
import { BillingsModule } from '../modules/billing/billings.module';
import { CalendarModule } from '../modules/calendar/calendar.module';
import { ChatsModule } from '../modules/chats/chats.module';
import { DevicesModule } from '../modules/devices/devices.module';
import { FamiliesModule } from '../modules/families/families.module';
import { FamilyMembersModule } from '../modules/family-members/family-members.module';
import { FinanceModule } from '../modules/finance/finance.module';
import { InvitationsModule } from '../modules/invitations/invitations.module';
import { LocationsModule } from '../modules/locations/locations.module';
import { MessagesModule } from '../modules/messages/messages.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { RewardsModule } from '../modules/rewards/rewards.module';
import { RolesPermissionsModule } from '../modules/roles-permissions/roles-permissions.module';
import { SosModule } from '../modules/sos/sos.module';
import { SubscriptionPlansModule } from '../modules/subscription-plans/subscription-plans.module';
import { SubscriptionsModule } from '../modules/subscriptions/subscriptions.module';
import { TasksModule } from '../modules/tasks/tasks.module';
import { UsersModule } from '../modules/users/users.module';

const DOCS_PATH = 'api/docs';

/**
 * Nhóm "service" cho Swagger UI: mỗi nhóm là một OpenAPI document riêng (gom theo domain),
 * FE chọn trên dropdown thì chỉ hiện API của nhóm đó.
 */
interface ServiceGroup {
  /** Dùng làm path con: `api/docs/<key>` (JSON ở `api/docs/<key>-json`). */
  key: string;
  /** Nhãn hiển thị trên dropdown. */
  name: string;
  /** Các module được include vào document này. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modules: any[];
}

const SERVICE_GROUPS: ServiceGroup[] = [
  {
    key: 'auth-users',
    name: 'Auth & Users',
    modules: [AuthModule, UsersModule],
  },
  {
    key: 'family',
    name: 'Family',
    modules: [FamiliesModule, FamilyMembersModule, InvitationsModule],
  },
  {
    key: 'finance',
    name: 'Finance',
    modules: [FinanceModule],
  },
  {
    key: 'admin-subscription',
    name: 'Admin & Subscription',
    modules: [
      AdminModule,
      SubscriptionPlansModule,
      SubscriptionsModule,
      BillingsModule,
    ],
  },
  {
    key: 'communication',
    name: 'Communication',
    modules: [ChatsModule, MessagesModule, NotificationsModule, AiChatbotModule],
  },
  {
    key: 'care',
    name: 'Care & Lifestyle',
    modules: [
      CalendarModule,
      TasksModule,
      AlbumsModule,
      RewardsModule,
      LocationsModule,
      DevicesModule,
      SosModule,
    ],
  },
  {
    key: 'system',
    name: 'System',
    modules: [RolesPermissionsModule],
  },
];

function buildConfig() {
  return new DocumentBuilder()
    .setTitle('Family Care API')
    .setDescription(
      'Backend API for Family Care Digital Family Management Solution',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
}

/**
 * Cấu hình Swagger với dropdown chọn "service":
 * - Mục "All" (mặc định) gộp toàn bộ API tại `api/docs`.
 * - Mỗi nhóm domain là một document riêng tại `api/docs/<key>`.
 */
export function setupSwagger(app: INestApplication): void {
  const config = buildConfig();

  // Document tổng hợp toàn bộ API (mặc định).
  const fullDocument = SwaggerModule.createDocument(app, config);

  // Mỗi nhóm domain → một document + JSON riêng tại `api/docs/<key>-json`.
  for (const group of SERVICE_GROUPS) {
    const document = SwaggerModule.createDocument(app, config, {
      include: group.modules,
    });
    SwaggerModule.setup(`${DOCS_PATH}/${group.key}`, app, document);
  }

  const urls = [
    { name: 'All', url: `/${DOCS_PATH}-json` },
    ...SERVICE_GROUPS.map((group) => ({
      name: group.name,
      url: `/${DOCS_PATH}/${group.key}-json`,
    })),
  ];

  // UI chính: dropdown chọn spec ở thanh trên cùng, mặc định "All".
  // @nestjs/swagger mặc định ẩn `.download-url-wrapper` (vùng chứa dropdown chọn spec),
  // nên cần customCss bỏ ẩn để selector hiện ra.
  SwaggerModule.setup(DOCS_PATH, app, fullDocument, {
    customCss:
      '.swagger-ui .topbar .download-url-wrapper { display: flex !important; }',
    swaggerOptions: {
      urls,
      'urls.primaryName': 'All',
      persistAuthorization: true,
    },
  });
}
