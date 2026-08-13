# Realtime Notifications (WS + FCM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đẩy notification realtime qua WebSocket (namespace `/notifications`) + FCM push, phủ 4 nhóm event mới (join request/thành viên, tasks & calendar, finance, chat), theo spec `docs/superpowers/specs/2026-07-15-realtime-notifications-design.md`.

**Architecture:** Dispatcher tập trung trong `NotificationsModule`. `NotificationsService.notify()` persist DB (tx-aware) rồi enqueue job BullMQ; worker (`NotificationsProcessor`) load rows → `NotificationDispatcher` → 2 channel plugin (`WsNotificationChannel`, `FcmNotificationChannel`). Chat + reject-join-request là push-only (không persist). Reminder task/calendar chạy bằng BullMQ repeatable job quét 5 phút/lần.

**Tech Stack:** NestJS 11, Prisma 6.19 (PostgreSQL), socket.io 4 (đã có), `@nestjs/bullmq` + `bullmq` (MỚI), Redis 7 (MỚI), `firebase-admin` (MỚI).

## Global Constraints

- Mọi `message` trả client (kể cả WS error) là **TIẾNG VIỆT**; controller chỉ `return data`, dùng `@ResponseMessage(...)`.
- Type chỉ-là-type trong tham số có decorator → **`import type`** (TS `nodenext`, lỗi TS1272 nếu quên).
- Chỉ Prisma, inject `PrismaService` (đã `@Global`). PK model mới đặt field `id` (KHÔNG `<entity>Id`).
- Máy dev này (Windows, Postgres 18 native :5432): `prisma migrate dev` bị chặn non-interactive → tạo migration bằng `prisma migrate diff` + `prisma migrate deploy` (xem Task 2). KHÔNG chạy `prisma generate`/`migrate` khi dev server hoặc Prisma Studio đang mở (file lock Windows).
- Lỗi notification KHÔNG được làm chết nghiệp vụ chính: mọi lỗi enqueue Redis chỉ `logger.error`, không throw ra caller.
- Caller đang trong `prisma.$transaction` → `notify(..., { tx })` chỉ persist; caller PHẢI gọi `dispatch(ids)` SAU khi transaction kết thúc thành công. Enqueue trong tx là bug.
- Commit message: conventional commits tiếng Anh (`feat:`, `test:`, `docs:`) như lịch sử repo.
- Mọi lệnh chạy trong `server/`.

---

### Task 1: Hạ tầng — deps, Redis compose, config, BullMQ root

**Files:**
- Modify: `server/package.json` (qua npm install)
- Modify: `server/docker-compose.yml`, `server/docker-compose.prod.yml`
- Modify: `server/src/config/configuration.ts`
- Modify: `server/src/app.module.ts`
- Modify: `server/.env.example`, `server/.env.production.example`

**Interfaces:**
- Produces: config keys `redis.host`, `redis.port`, `firebase.serviceAccount`; `BullModule.forRootAsync` đã đăng ký global — các task sau chỉ cần `BullModule.registerQueue`.

- [ ] **Step 1: Cài deps**

Run: `npm install @nestjs/bullmq bullmq firebase-admin`
Expected: cài OK, `postinstall` chạy `prisma generate` không lỗi.

- [ ] **Step 2: Thêm service `redis` vào `docker-compose.yml`**

Thêm vào `services:` (cùng cấp `db:`), và volume `redisdata_dev` vào `volumes:`:

```yaml
  redis:
    image: redis:7-alpine
    container_name: familycare_redis_dev
    ports:
      - '6379:6379'
    volumes:
      - redisdata_dev:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped
```

Trong service `api` (profile full): thêm `REDIS_HOST: redis` vào `environment:` và `redis: { condition: service_healthy }` vào `depends_on:`.

- [ ] **Step 3: Tương tự cho `docker-compose.prod.yml`**

Service `redis` y hệt (đổi container_name `familycare_redis`, volume `redisdata`, bỏ publish port ra host nếu file prod không publish port db). Service api prod: `REDIS_HOST: redis` + depends_on redis healthy.

- [ ] **Step 4: Thêm config keys vào `configuration.ts`**

Thêm 2 khối (sau `throttle`):

```ts
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  firebase: {
    // Base64 của file service-account JSON. Rỗng = tắt kênh FCM (dev không cần Firebase).
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT || '',
  },
```

- [ ] **Step 5: Đăng ký BullMQ root trong `app.module.ts`**

Thêm import:

```ts
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
```

Thêm vào mảng `imports` (sau ConfigModule):

```ts
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
        },
      }),
    }),
```

- [ ] **Step 6: Cập nhật `.env.example` + `.env.production.example`**

```dotenv
# Redis (BullMQ queue cho notifications realtime)
REDIS_HOST=localhost
REDIS_PORT=6379

# Firebase Cloud Messaging — base64 của file service-account JSON.
# Để trống = tắt kênh FCM (app vẫn chạy bình thường).
FIREBASE_SERVICE_ACCOUNT=
```

(File production example: `REDIS_HOST=redis`.)

- [ ] **Step 7: Bật Redis dev + verify app boot**

Run: `docker compose up -d redis` rồi `npx tsc --noEmit`
Expected: tsc 0 lỗi. (Nếu muốn kiểm tra runtime: `npm run start:dev` → boot không crash, Ctrl+C.)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json docker-compose.yml docker-compose.prod.yml src/config/configuration.ts src/app.module.ts .env.example .env.production.example
git commit -m "feat(notifications): add Redis + BullMQ + firebase-admin infrastructure"
```

---

### Task 2: Migration schema — enum, DeviceToken, reminderSentAt

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_notifications_realtime/migration.sql` (generated)

**Interfaces:**
- Produces: enum values `NotificationType.{JOIN_REQUEST,MEMBER,TASK,CALENDAR,FINANCE,CHAT}`, enum `DevicePlatform`, model `DeviceToken` (client: `prisma.deviceToken`), fields `TaskAssignment.reminderSentAt`, `CalendarEventParticipant.reminderSentAt`.

- [ ] **Step 1: Sửa `schema.prisma`**

1. Enum `NotificationType` (dòng ~1274) thêm sau `ALBUM_TAG`:

```prisma
  JOIN_REQUEST
  MEMBER
  TASK
  CALENDAR
  FINANCE
  CHAT
```

2. Thêm enum + model mới (đặt cạnh model `Notification`):

```prisma
enum DevicePlatform {
  ANDROID
  IOS
  WEB
}

/// Thiết bị nhận FCM push — gắn theo USER (nhận noti của mọi family mình tham gia).
model DeviceToken {
  id         String         @id @default(uuid())
  userId     String
  token      String         @unique
  platform   DevicePlatform
  deviceName String?
  lastSeenAt DateTime       @updatedAt
  createdAt  DateTime       @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("device_tokens")
}
```

3. Trên `model User`: thêm relation `deviceTokens DeviceToken[]` (cạnh `refreshTokens`).
4. `model TaskAssignment`: thêm field `reminderSentAt DateTime?` (model này không dùng `@map` cho field — giữ đúng style).
5. `model CalendarEventParticipant`: thêm `reminderSentAt DateTime? @map("reminder_sent_at") @db.Timestamptz` (model này dùng `@map`).

- [ ] **Step 2: Validate + tạo migration bằng diff (máy này không chạy được `migrate dev`)**

```bash
npx prisma validate
mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_notifications_realtime
# Diff từ DB dev đang sync-với-migrations sang schema mới (quy trình diff+deploy của repo):
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<thư-mục-vừa-tạo>/migration.sql
```

(Xem các migration gần nhất trong `prisma/migrations/` để lấy đúng format tên thư mục. Kiểm tra file SQL sinh ra có: `ALTER TYPE "NotificationType" ADD VALUE` ×6, `CREATE TABLE "device_tokens"`, 2 lệnh `ALTER TABLE ... ADD COLUMN` cho `reminderSentAt`/`reminder_sent_at`.)

- [ ] **Step 3: Áp dụng + generate (dev server phải ĐANG TẮT)**

Run: `npx prisma migrate deploy && npx prisma generate && npx tsc --noEmit`
Expected: migration applied, generate OK, tsc 0 lỗi.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(notifications): schema for realtime notifications (enum values, device_tokens, reminderSentAt)"
```

---

### Task 3: Types dùng chung + ws-auth util + NotificationsGateway

**Files:**
- Create: `server/src/modules/notifications/notifications.types.ts`
- Create: `server/src/common/ws/ws-auth.util.ts`
- Create: `server/src/modules/notifications/notifications.gateway.ts`
- Modify: `server/src/modules/notifications/notifications.module.ts`

**Interfaces:**
- Produces:
  - `NOTIFICATIONS_QUEUE = 'notifications'`, `DISPATCH_JOB = 'dispatch'`, `REMINDER_SCAN_JOB = 'reminder-scan'`
  - `NotificationPayload { id: string|null; familyId: string|null; type; priority; title; body; referenceType: string|null; referenceId: string|null; createdAt: string }`
  - `NotificationDelivery { userId: string; memberId: string|null; notification: NotificationPayload }`
  - `EphemeralNotificationInput { familyId: string|null; type; priority; title; body; referenceType?; referenceId? }`
  - `DispatchJobData = { kind:'persisted'; notificationIds: string[] } | { kind:'ephemeral'; userIds: string[]; payload: EphemeralNotificationInput }`
  - `authenticateSocket(client, deps): Promise<string /*userId*/>`
  - `NotificationsGateway.emitToUsers(userIds: string[], event: string, payload: unknown): void`

- [ ] **Step 1: Viết `notifications.types.ts`**

```ts
import { NotificationPriority, NotificationType } from '@prisma/client';

export const NOTIFICATIONS_QUEUE = 'notifications';
export const DISPATCH_JOB = 'dispatch';
export const REMINDER_SCAN_JOB = 'reminder-scan';

/** Nội dung 1 notification đẩy xuống client (id = null nếu push-only, không persist). */
export interface NotificationPayload {
  id: string | null;
  familyId: string | null;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

/** Một lượt giao tới 1 user (memberId = null với push-only). */
export interface NotificationDelivery {
  userId: string;
  memberId: string | null;
  notification: NotificationPayload;
}

/** Input cho notification push-only (chat, reject join request). */
export interface EphemeralNotificationInput {
  familyId: string | null;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  referenceType?: string | null;
  referenceId?: string | null;
}

export type DispatchJobData =
  | { kind: 'persisted'; notificationIds: string[] }
  | { kind: 'ephemeral'; userIds: string[]; payload: EphemeralNotificationInput };
```

- [ ] **Step 2: Viết `common/ws/ws-auth.util.ts`**

Trích đúng logic handshake của `sos.gateway.ts:79-104` + `extractToken` của nó (xem method private `extractToken` trong file đó — copy nguyên cách đọc `handshake.auth.token` / header `Authorization: Bearer`):

```ts
import { AccountStatus } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';

import type { JwtPayload } from '../../modules/auth/types/jwt-payload.type';
import type { UsersService } from '../../modules/users/users.service';

export interface WsAuthDeps {
  jwtService: JwtService;
  config: ConfigService;
  usersService: UsersService;
}

/**
 * Xác thực handshake WS giống lớp HTTP: verify access token, user phải ACTIVE.
 * Trả về userId; throw Error(message tiếng Việt) nếu thất bại.
 */
export async function authenticateSocket(
  client: Socket,
  deps: WsAuthDeps,
): Promise<string> {
  const token = extractToken(client);
  if (!token) {
    throw new Error('Thiếu token');
  }
  const payload = await deps.jwtService.verifyAsync<JwtPayload>(token, {
    secret: deps.config.getOrThrow<string>('jwt.accessSecret'),
  });
  const user = await deps.usersService.findById(payload.sub);
  if (!user || user.accountStatus !== AccountStatus.ACTIVE) {
    throw new Error('Tài khoản không hợp lệ');
  }
  return user.id;
}

function extractToken(client: Socket): string | null {
  const fromAuth = (client.handshake.auth as { token?: string } | undefined)
    ?.token;
  const fromHeader = client.handshake.headers.authorization;
  const raw = fromAuth ?? fromHeader;
  if (!raw) {
    return null;
  }
  return raw.startsWith('Bearer ') ? raw.slice('Bearer '.length) : raw;
}
```

(Nếu `extractToken` trong sos.gateway khác chi tiết trên — ưu tiên copy theo sos.gateway để 2 nơi đồng nhất hành vi.)

- [ ] **Step 3: Viết `notifications.gateway.ts`**

```ts
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { authenticateSocket } from '../../common/ws/ws-auth.util';
import { UsersService } from '../users/users.service';

const WS_CORS_ORIGINS = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/**
 * Kênh realtime notification cá nhân (namespace `/notifications`).
 * Connect thành công → tự join room `user:<userId>`; không có message join thủ công.
 */
@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: WS_CORS_ORIGINS.length > 0 ? WS_CORS_ORIGINS : true,
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const userId = await authenticateSocket(client, {
        jwtService: this.jwtService,
        config: this.config,
        usersService: this.usersService,
      });
      (client.data as { userId?: string }).userId = userId;
      await client.join(this.userRoom(userId));
    } catch (err) {
      this.logger.warn(
        `Từ chối notification socket ${client.id}: ${(err as Error).message}`,
      );
      client.emit('notification:error', { message: 'Xác thực thất bại' });
      client.disconnect(true);
    }
  }

  /** Worker/channel gọi để đẩy event tới từng user (mọi thiết bị đang mở). */
  emitToUsers(userIds: string[], event: string, payload: unknown): void {
    for (const userId of new Set(userIds)) {
      this.server.to(this.userRoom(userId)).emit(event, payload);
    }
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }
}
```

- [ ] **Step 4: Đăng ký trong `notifications.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { FamilyMembersModule } from '../family-members/family-members.module';
import { UsersModule } from '../users/users.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [JwtModule.register({}), UsersModule, FamilyMembersModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

- [ ] **Step 5: Verify + commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 lỗi.

```bash
git add src/modules/notifications/notifications.types.ts src/common/ws/ws-auth.util.ts src/modules/notifications/notifications.gateway.ts src/modules/notifications/notifications.module.ts
git commit -m "feat(notifications): /notifications WS gateway + shared ws-auth helper"
```

---

### Task 4: NotificationsService — notify/dispatch/ephemeral/unread-count

**Files:**
- Modify: `server/src/modules/notifications/notifications.service.ts`
- Modify: `server/src/modules/notifications/notifications.controller.ts`
- Modify: `server/src/modules/notifications/notifications.module.ts`
- Test: `server/src/modules/notifications/notifications.service.spec.ts`

**Interfaces:**
- Consumes: `NOTIFICATIONS_QUEUE`, `DISPATCH_JOB`, `DispatchJobData`, `EphemeralNotificationInput` (Task 3); `NotificationsGateway.emitToUsers` (Task 3).
- Produces (mọi call site dùng từ đây):
  - `notify(familyId: string, recipientMemberIds: string[], input: CreateNotificationInput, opts?: { tx?: Prisma.TransactionClient }): Promise<{ ids: string[] }>` — có `opts.tx` thì CHỈ persist; không có thì persist + tự dispatch.
  - `dispatch(notificationIds: string[]): Promise<void>` — enqueue, nuốt lỗi Redis (log).
  - `notifyUsersEphemeral(userIds: string[], payload: EphemeralNotificationInput): Promise<void>`
  - `unreadCount(memberId: string): Promise<{ count: number }>`
  - `createForMembers` GIỮ NGUYÊN tạm thời (xóa ở Task 9).

- [ ] **Step 1: Viết test mới vào `notifications.service.spec.ts`**

Giữ các test hiện có của `createForMembers`, thêm (theo đúng pattern instantiate trực tiếp của file này — service giờ nhận thêm `queue` và `gateway` mock):

```ts
describe('notify / dispatch', () => {
  const input = {
    type: NotificationType.GENERAL,
    title: 'T',
    body: 'B',
  };

  it('không có tx: persist rồi enqueue 1 job dispatch với đủ ids', async () => {
    prisma.notification.createManyAndReturn.mockResolvedValue([
      { id: 'n1' },
      { id: 'n2' },
    ]);
    const result = await service.notify('family-1', ['m1', 'm2'], input);
    expect(result.ids).toEqual(['n1', 'n2']);
    expect(queue.add).toHaveBeenCalledWith('dispatch', {
      kind: 'persisted',
      notificationIds: ['n1', 'n2'],
    });
  });

  it('có tx: chỉ persist bằng tx, KHÔNG enqueue', async () => {
    const tx = {
      notification: {
        createManyAndReturn: jest.fn().mockResolvedValue([{ id: 'n1' }]),
      },
    };
    const result = await service.notify('family-1', ['m1'], input, {
      tx: tx as never,
    });
    expect(result.ids).toEqual(['n1']);
    expect(tx.notification.createManyAndReturn).toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('recipient rỗng: không persist, không enqueue', async () => {
    const result = await service.notify('family-1', [], input);
    expect(result.ids).toEqual([]);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('dispatch nuốt lỗi Redis (không throw)', async () => {
    queue.add.mockRejectedValue(new Error('redis down'));
    await expect(service.dispatch(['n1'])).resolves.toBeUndefined();
  });

  it('notifyUsersEphemeral enqueue job ephemeral', async () => {
    await service.notifyUsersEphemeral(['u1'], {
      familyId: null,
      type: NotificationType.CHAT,
      priority: NotificationPriority.NORMAL,
      title: 'T',
      body: 'B',
    });
    expect(queue.add).toHaveBeenCalledWith('dispatch', {
      kind: 'ephemeral',
      userIds: ['u1'],
      payload: expect.objectContaining({ type: NotificationType.CHAT }),
    });
  });
});
```

Mock setup thêm vào `beforeEach` của file: `queue = { add: jest.fn().mockResolvedValue(undefined) }`, `gateway = { emitToUsers: jest.fn() }`, prisma mock thêm `notification.createManyAndReturn`, `familyMember.findUnique`; khởi tạo `service = new NotificationsService(prisma as never, queue as never, gateway as never)`.

- [ ] **Step 2: Chạy test → FAIL**

Run: `npx jest src/modules/notifications/notifications.service.spec.ts`
Expected: FAIL (notify is not a function).

- [ ] **Step 3: Implement trong `notifications.service.ts`**

Thêm imports + constructor + methods (GIỮ `createForMembers`, `listForMember`, `markRead`, `markAllRead` hiện có):

```ts
import { InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { NotificationsGateway } from './notifications.gateway';
import {
  DISPATCH_JOB,
  NOTIFICATIONS_QUEUE,
} from './notifications.types';
import type {
  DispatchJobData,
  EphemeralNotificationInput,
} from './notifications.types';
```

```ts
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
    private readonly gateway: NotificationsGateway,
  ) {}

  /**
   * Persist notification (tx-aware) và enqueue dispatch realtime.
   * QUY ƯỚC: có `opts.tx` → CHỈ persist, caller tự gọi `dispatch(ids)` SAU khi
   * transaction commit (enqueue trong tx là bug: rollback vẫn đẩy noti "ma").
   */
  async notify(
    familyId: string,
    recipientMemberIds: string[],
    input: CreateNotificationInput,
    opts: { tx?: Prisma.TransactionClient } = {},
  ): Promise<{ ids: string[] }> {
    if (recipientMemberIds.length === 0) {
      return { ids: [] };
    }
    const client = opts.tx ?? this.prisma;
    const rows = await client.notification.createManyAndReturn({
      data: recipientMemberIds.map((recipientMemberId) => ({
        familyId,
        recipientMemberId,
        type: input.type,
        priority: input.priority ?? NotificationPriority.NORMAL,
        title: input.title,
        body: input.body,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
      })),
      select: { id: true },
    });
    const ids = rows.map((row) => row.id);
    if (!opts.tx) {
      await this.dispatch(ids);
    }
    return { ids };
  }

  /** Enqueue job đẩy realtime cho các notification ĐÃ persist. Nuốt lỗi Redis. */
  async dispatch(notificationIds: string[]): Promise<void> {
    if (notificationIds.length === 0) {
      return;
    }
    const data: DispatchJobData = { kind: 'persisted', notificationIds };
    try {
      await this.queue.add(DISPATCH_JOB, data);
    } catch (err) {
      this.logger.error(
        `Không thể enqueue dispatch notification: ${(err as Error).message}`,
      );
    }
  }

  /** Push-only (chat, reject join request): không persist, đẩy theo userIds. */
  async notifyUsersEphemeral(
    userIds: string[],
    payload: EphemeralNotificationInput,
  ): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    const data: DispatchJobData = { kind: 'ephemeral', userIds, payload };
    try {
      await this.queue.add(DISPATCH_JOB, data);
    } catch (err) {
      this.logger.error(
        `Không thể enqueue notification ephemeral: ${(err as Error).message}`,
      );
    }
  }

  async unreadCount(memberId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { recipientMemberId: memberId, isRead: false },
    });
    return { count };
  }

  /** Đẩy badge mới xuống client sau khi mark-read (best-effort). */
  private async pushUnreadCount(memberId: string): Promise<void> {
    try {
      const member = await this.prisma.familyMember.findUnique({
        where: { id: memberId },
        select: { userId: true, familyId: true },
      });
      if (!member) {
        return;
      }
      const { count } = await this.unreadCount(memberId);
      this.gateway.emitToUsers([member.userId], 'notification:unread-count', {
        familyId: member.familyId,
        count,
      });
    } catch (err) {
      this.logger.error(
        `Không thể đẩy unread-count: ${(err as Error).message}`,
      );
    }
  }
```

Cuối `markRead` (trước `return`... đổi thành: lưu kết quả update, `await this.pushUnreadCount(memberId)`, rồi return) và cuối `markAllRead` (trước `return null`): thêm `await this.pushUnreadCount(memberId);`.

- [ ] **Step 4: Thêm endpoint unread-count vào `notifications.controller.ts`**

Thêm TRƯỚC route `@Patch(':notificationId/read')` (tránh nuốt route):

```ts
  @Get('unread-count')
  @ResponseMessage('Lấy số thông báo chưa đọc thành công')
  @ApiOperation({ summary: 'Số thông báo chưa đọc của thành viên hiện tại' })
  unreadCount(@CurrentFamilyMember('id') memberId: string) {
    return this.notificationsService.unreadCount(memberId);
  }
```

- [ ] **Step 5: Đăng ký queue trong `notifications.module.ts`**

Thêm vào `imports`:

```ts
import { BullModule } from '@nestjs/bullmq';
import { NOTIFICATIONS_QUEUE } from './notifications.types';
// ...
    BullModule.registerQueue({
      name: NOTIFICATIONS_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: { age: 24 * 3600 },
      },
    }),
```

- [ ] **Step 6: Chạy test → PASS**

Run: `npx jest src/modules/notifications/notifications.service.spec.ts && npx tsc --noEmit`
Expected: PASS, 0 lỗi tsc.

- [ ] **Step 7: Commit**

```bash
git add src/modules/notifications
git commit -m "feat(notifications): notify/dispatch/ephemeral API + unread-count endpoint"
```

---

### Task 5: NotificationDispatcher + WsNotificationChannel

**Files:**
- Create: `server/src/modules/notifications/dispatcher/notification-channel.ts`
- Create: `server/src/modules/notifications/dispatcher/notification-dispatcher.ts`
- Create: `server/src/modules/notifications/dispatcher/ws-notification.channel.ts`
- Modify: `server/src/modules/notifications/notifications.module.ts`
- Test: `server/src/modules/notifications/dispatcher/notification-dispatcher.spec.ts`

**Interfaces:**
- Consumes: `NotificationDelivery` (Task 3), `NotificationsGateway.emitToUsers` (Task 3).
- Produces: `NotificationChannel { name: string; deliver(deliveries: NotificationDelivery[]): Promise<void> }`; `NotificationDispatcher.dispatch(deliveries: NotificationDelivery[]): Promise<void>`.

- [ ] **Step 1: `notification-channel.ts`**

```ts
import type { NotificationDelivery } from '../notifications.types';

/** Một kênh đẩy notification (WS, FCM, sau này email...). */
export interface NotificationChannel {
  readonly name: string;
  deliver(deliveries: NotificationDelivery[]): Promise<void>;
}
```

- [ ] **Step 2: Test dispatcher (`notification-dispatcher.spec.ts`)**

```ts
import { NotificationPriority, NotificationType } from '@prisma/client';

import { NotificationDispatcher } from './notification-dispatcher';
import type { NotificationDelivery } from '../notifications.types';

const delivery: NotificationDelivery = {
  userId: 'u1',
  memberId: 'm1',
  notification: {
    id: 'n1',
    familyId: 'f1',
    type: NotificationType.GENERAL,
    priority: NotificationPriority.NORMAL,
    title: 'T',
    body: 'B',
    referenceType: null,
    referenceId: null,
    createdAt: new Date().toISOString(),
  },
};

describe('NotificationDispatcher', () => {
  it('gọi mọi channel; 1 channel lỗi không chặn channel còn lại', async () => {
    const ws = { name: 'ws', deliver: jest.fn().mockRejectedValue(new Error('boom')) };
    const fcm = { name: 'fcm', deliver: jest.fn().mockResolvedValue(undefined) };
    const dispatcher = new NotificationDispatcher(ws as never, fcm as never);
    await expect(dispatcher.dispatch([delivery])).resolves.toBeUndefined();
    expect(ws.deliver).toHaveBeenCalledWith([delivery]);
    expect(fcm.deliver).toHaveBeenCalledWith([delivery]);
  });

  it('deliveries rỗng: không gọi channel nào', async () => {
    const ws = { name: 'ws', deliver: jest.fn() };
    const fcm = { name: 'fcm', deliver: jest.fn() };
    const dispatcher = new NotificationDispatcher(ws as never, fcm as never);
    await dispatcher.dispatch([]);
    expect(ws.deliver).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Chạy test → FAIL** (`npx jest notification-dispatcher`)

- [ ] **Step 4: Implement `notification-dispatcher.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';

import { FcmNotificationChannel } from './fcm-notification.channel';
import type { NotificationChannel } from './notification-channel';
import { WsNotificationChannel } from './ws-notification.channel';
import type { NotificationDelivery } from '../notifications.types';

/**
 * Phát 1 lô delivery qua mọi channel. Lỗi 1 channel chỉ log — không chặn
 * channel khác, không fail job (DB đã là source of truth).
 */
@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);
  private readonly channels: NotificationChannel[];

  constructor(ws: WsNotificationChannel, fcm: FcmNotificationChannel) {
    this.channels = [ws, fcm];
  }

  async dispatch(deliveries: NotificationDelivery[]): Promise<void> {
    if (deliveries.length === 0) {
      return;
    }
    for (const channel of this.channels) {
      try {
        await channel.deliver(deliveries);
      } catch (err) {
        this.logger.error(
          `Channel ${channel.name} lỗi: ${(err as Error).message}`,
        );
      }
    }
  }
}
```

(Ở task này `FcmNotificationChannel` chưa tồn tại → tạo file `fcm-notification.channel.ts` TỐI THIỂU để compile, Task 6 sẽ hoàn thiện:)

```ts
import { Injectable } from '@nestjs/common';

import type { NotificationChannel } from './notification-channel';
import type { NotificationDelivery } from '../notifications.types';

@Injectable()
export class FcmNotificationChannel implements NotificationChannel {
  readonly name = 'fcm';

  async deliver(_deliveries: NotificationDelivery[]): Promise<void> {
    // Hoàn thiện ở task FCM.
  }
}
```

- [ ] **Step 5: Implement `ws-notification.channel.ts`**

```ts
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsGateway } from '../notifications.gateway';
import type { NotificationChannel } from './notification-channel';
import type { NotificationDelivery } from '../notifications.types';

@Injectable()
export class WsNotificationChannel implements NotificationChannel {
  readonly name = 'ws';

  constructor(
    private readonly gateway: NotificationsGateway,
    private readonly prisma: PrismaService,
  ) {}

  async deliver(deliveries: NotificationDelivery[]): Promise<void> {
    for (const delivery of deliveries) {
      this.gateway.emitToUsers(
        [delivery.userId],
        'notification:new',
        delivery.notification,
      );
    }
    // Badge mới cho các notification đã persist (push-only không đổi badge).
    const persisted = deliveries.filter((d) => d.memberId !== null);
    for (const delivery of persisted) {
      const count = await this.prisma.notification.count({
        where: { recipientMemberId: delivery.memberId!, isRead: false },
      });
      this.gateway.emitToUsers(
        [delivery.userId],
        'notification:unread-count',
        { familyId: delivery.notification.familyId, count },
      );
    }
  }
}
```

- [ ] **Step 6: Đăng ký providers vào module** — thêm `NotificationDispatcher, WsNotificationChannel, FcmNotificationChannel` vào `providers` của `notifications.module.ts`.

- [ ] **Step 7: Test PASS + commit**

Run: `npx jest src/modules/notifications && npx tsc --noEmit`

```bash
git add src/modules/notifications
git commit -m "feat(notifications): channel dispatcher + WS channel"
```

---

### Task 6: FcmNotificationChannel hoàn chỉnh

**Files:**
- Modify: `server/src/modules/notifications/dispatcher/fcm-notification.channel.ts`
- Test: `server/src/modules/notifications/dispatcher/fcm-notification.channel.spec.ts`

**Interfaces:**
- Consumes: `NotificationDelivery`; config `firebase.serviceAccount`; bảng `device_tokens`.
- Produces: channel gửi FCM thật, tự disable khi thiếu ENV, tự dọn token chết.

- [ ] **Step 1: Viết test (`fcm-notification.channel.spec.ts`)**

Mock `firebase-admin` ở mức module:

```ts
const sendEach = jest.fn();
jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  messaging: () => ({ sendEach }),
}));

import { NotificationPriority, NotificationType } from '@prisma/client';

import { FcmNotificationChannel } from './fcm-notification.channel';

const delivery = {
  userId: 'u1',
  memberId: 'm1',
  notification: {
    id: 'n1',
    familyId: 'f1',
    type: NotificationType.SOS,
    priority: NotificationPriority.CRITICAL,
    title: 'SOS',
    body: 'B',
    referenceType: 'SOS_ALERT',
    referenceId: 'a1',
    createdAt: new Date().toISOString(),
  },
};

describe('FcmNotificationChannel', () => {
  let prisma: {
    deviceToken: { findMany: jest.Mock; deleteMany: jest.Mock };
  };
  let config: { get: jest.Mock };

  beforeEach(() => {
    sendEach.mockReset();
    prisma = {
      deviceToken: {
        findMany: jest.fn().mockResolvedValue([
          { token: 'tok-1', userId: 'u1' },
          { token: 'tok-2', userId: 'u1' },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    config = { get: jest.fn().mockReturnValue('eyJmYWtlIjoxfQ==') }; // base64 {"fake":1}
  });

  function makeChannel() {
    const channel = new FcmNotificationChannel(
      config as never,
      prisma as never,
    );
    channel.onModuleInit();
    return channel;
  }

  it('gửi 1 message/token của user nhận, priority CRITICAL → android high', async () => {
    sendEach.mockResolvedValue({
      responses: [{ success: true }, { success: true }],
    });
    await makeChannel().deliver([delivery]);
    expect(sendEach).toHaveBeenCalledTimes(1);
    const messages = sendEach.mock.calls[0][0];
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      token: 'tok-1',
      notification: { title: 'SOS', body: 'B' },
      android: { priority: 'high' },
      data: expect.objectContaining({ type: 'SOS', referenceId: 'a1' }),
    });
  });

  it('token bị báo not-registered → xóa khỏi device_tokens', async () => {
    sendEach.mockResolvedValue({
      responses: [
        {
          success: false,
          error: { code: 'messaging/registration-token-not-registered' },
        },
        { success: true },
      ],
    });
    await makeChannel().deliver([delivery]);
    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['tok-1'] } },
    });
  });

  it('thiếu FIREBASE_SERVICE_ACCOUNT → disabled, không gửi, không throw', async () => {
    config.get.mockReturnValue('');
    await makeChannel().deliver([delivery]);
    expect(sendEach).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Chạy → FAIL** (`npx jest fcm-notification`)

- [ ] **Step 3: Implement**

```ts
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationPriority } from '@prisma/client';
import * as admin from 'firebase-admin';

import { PrismaService } from '../../../prisma/prisma.service';
import type { NotificationChannel } from './notification-channel';
import type { NotificationDelivery } from '../notifications.types';

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);
const FCM_BATCH_SIZE = 500;

@Injectable()
export class FcmNotificationChannel
  implements NotificationChannel, OnModuleInit
{
  readonly name = 'fcm';
  private readonly logger = new Logger(FcmNotificationChannel.name);
  private enabled = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const raw = this.config.get<string>('firebase.serviceAccount');
    if (!raw) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT trống — kênh FCM bị tắt (chỉ còn WS).',
      );
      return;
    }
    try {
      const serviceAccount = JSON.parse(
        Buffer.from(raw, 'base64').toString('utf8'),
      ) as admin.ServiceAccount;
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }
      this.enabled = true;
    } catch (err) {
      this.logger.error(
        `FIREBASE_SERVICE_ACCOUNT không hợp lệ, tắt FCM: ${(err as Error).message}`,
      );
    }
  }

  async deliver(deliveries: NotificationDelivery[]): Promise<void> {
    if (!this.enabled || deliveries.length === 0) {
      return;
    }
    const userIds = [...new Set(deliveries.map((d) => d.userId))];
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true, userId: true },
    });
    if (tokens.length === 0) {
      return;
    }
    const tokensByUser = new Map<string, string[]>();
    for (const row of tokens) {
      const list = tokensByUser.get(row.userId) ?? [];
      list.push(row.token);
      tokensByUser.set(row.userId, list);
    }

    const messages: admin.messaging.Message[] = deliveries.flatMap(
      (delivery) =>
        (tokensByUser.get(delivery.userId) ?? []).map((token) => ({
          token,
          notification: {
            title: delivery.notification.title,
            body: delivery.notification.body,
          },
          android: {
            priority: this.isHighPriority(delivery.notification.priority)
              ? ('high' as const)
              : ('normal' as const),
          },
          data: {
            notificationId: delivery.notification.id ?? '',
            type: delivery.notification.type,
            familyId: delivery.notification.familyId ?? '',
            referenceType: delivery.notification.referenceType ?? '',
            referenceId: delivery.notification.referenceId ?? '',
          },
        })),
    );

    const deadTokens: string[] = [];
    for (let i = 0; i < messages.length; i += FCM_BATCH_SIZE) {
      const batch = messages.slice(i, i + FCM_BATCH_SIZE);
      const result = await admin.messaging().sendEach(batch);
      result.responses.forEach((response, index) => {
        if (
          !response.success &&
          response.error &&
          DEAD_TOKEN_CODES.has(response.error.code)
        ) {
          deadTokens.push((batch[index] as { token: string }).token);
        }
      });
    }
    if (deadTokens.length > 0) {
      await this.prisma.deviceToken.deleteMany({
        where: { token: { in: deadTokens } },
      });
      this.logger.log(`Đã dọn ${deadTokens.length} FCM token chết`);
    }
  }

  private isHighPriority(priority: NotificationPriority): boolean {
    return (
      priority === NotificationPriority.HIGH ||
      priority === NotificationPriority.CRITICAL
    );
  }
}
```

- [ ] **Step 4: Test PASS + commit**

Run: `npx jest src/modules/notifications && npx tsc --noEmit`

```bash
git add src/modules/notifications/dispatcher
git commit -m "feat(notifications): FCM channel with dead-token cleanup"
```

---

### Task 7: NotificationsProcessor (BullMQ worker)

**Files:**
- Create: `server/src/modules/notifications/notifications.processor.ts`
- Modify: `server/src/modules/notifications/notifications.module.ts`
- Test: `server/src/modules/notifications/notifications.processor.spec.ts`

**Interfaces:**
- Consumes: `DispatchJobData`, `REMINDER_SCAN_JOB` (Task 3), `NotificationDispatcher` (Task 5), `RemindersService.scan()` (Task 13 — ở task này tạo interface trống).
- Produces: worker xử lý job `dispatch` (persisted + ephemeral) và `reminder-scan`.

- [ ] **Step 1: Test (`notifications.processor.spec.ts`)**

```ts
import { NotificationPriority, NotificationType } from '@prisma/client';

import { NotificationsProcessor } from './notifications.processor';

describe('NotificationsProcessor', () => {
  let prisma: { notification: { findMany: jest.Mock } };
  let dispatcher: { dispatch: jest.Mock };
  let reminders: { scan: jest.Mock };
  let processor: NotificationsProcessor;

  beforeEach(() => {
    prisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'n1',
            familyId: 'f1',
            recipientMemberId: 'm1',
            type: NotificationType.GENERAL,
            priority: NotificationPriority.NORMAL,
            title: 'T',
            body: 'B',
            referenceType: null,
            referenceId: null,
            createdAt: new Date('2026-07-15T00:00:00Z'),
            recipientMember: { userId: 'u1' },
          },
        ]),
      },
    };
    dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) };
    reminders = { scan: jest.fn().mockResolvedValue(undefined) };
    processor = new NotificationsProcessor(
      prisma as never,
      dispatcher as never,
      reminders as never,
    );
  });

  it('job persisted: load rows + map delivery đúng shape', async () => {
    await processor.process({
      name: 'dispatch',
      data: { kind: 'persisted', notificationIds: ['n1'] },
    } as never);
    expect(dispatcher.dispatch).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: 'u1',
        memberId: 'm1',
        notification: expect.objectContaining({ id: 'n1', familyId: 'f1' }),
      }),
    ]);
  });

  it('job ephemeral: map mỗi userId thành 1 delivery memberId=null, id=null', async () => {
    await processor.process({
      name: 'dispatch',
      data: {
        kind: 'ephemeral',
        userIds: ['u1', 'u2'],
        payload: {
          familyId: 'f1',
          type: NotificationType.CHAT,
          priority: NotificationPriority.NORMAL,
          title: 'T',
          body: 'B',
        },
      },
    } as never);
    const deliveries = dispatcher.dispatch.mock.calls[0][0];
    expect(deliveries).toHaveLength(2);
    expect(deliveries[0]).toMatchObject({
      userId: 'u1',
      memberId: null,
      notification: expect.objectContaining({ id: null }),
    });
  });

  it('job reminder-scan: gọi reminders.scan()', async () => {
    await processor.process({ name: 'reminder-scan', data: {} } as never);
    expect(reminders.scan).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Chạy → FAIL**, rồi implement:

Tạo trước `server/src/modules/notifications/reminders.service.ts` tối thiểu (hoàn thiện ở Task 13):

```ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class RemindersService {
  async scan(): Promise<void> {
    // Hoàn thiện ở task reminder.
  }
}
```

`notifications.processor.ts`:

```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationDispatcher } from './dispatcher/notification-dispatcher';
import { RemindersService } from './reminders.service';
import {
  DISPATCH_JOB,
  NOTIFICATIONS_QUEUE,
  REMINDER_SCAN_JOB,
} from './notifications.types';
import type {
  DispatchJobData,
  NotificationDelivery,
} from './notifications.types';

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcher,
    private readonly reminders: RemindersService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === DISPATCH_JOB) {
      return this.handleDispatch(job.data as DispatchJobData);
    }
    if (job.name === REMINDER_SCAN_JOB) {
      return this.reminders.scan();
    }
    this.logger.warn(`Job không xác định: ${job.name}`);
  }

  private async handleDispatch(data: DispatchJobData): Promise<void> {
    if (data.kind === 'persisted') {
      const rows = await this.prisma.notification.findMany({
        where: { id: { in: data.notificationIds } },
        include: { recipientMember: { select: { userId: true } } },
      });
      const deliveries: NotificationDelivery[] = rows.map((row) => ({
        userId: row.recipientMember.userId,
        memberId: row.recipientMemberId,
        notification: {
          id: row.id,
          familyId: row.familyId,
          type: row.type,
          priority: row.priority,
          title: row.title,
          body: row.body,
          referenceType: row.referenceType,
          referenceId: row.referenceId,
          createdAt: row.createdAt.toISOString(),
        },
      }));
      return this.dispatcher.dispatch(deliveries);
    }

    const now = new Date().toISOString();
    const deliveries: NotificationDelivery[] = data.userIds.map((userId) => ({
      userId,
      memberId: null,
      notification: {
        id: null,
        familyId: data.payload.familyId,
        type: data.payload.type,
        priority: data.payload.priority,
        title: data.payload.title,
        body: data.payload.body,
        referenceType: data.payload.referenceType ?? null,
        referenceId: data.payload.referenceId ?? null,
        createdAt: now,
      },
    }));
    return this.dispatcher.dispatch(deliveries);
  }
}
```

- [ ] **Step 3: Đăng ký `NotificationsProcessor, RemindersService` vào `providers` của module.**

- [ ] **Step 4: Test PASS + commit**

Run: `npx jest src/modules/notifications && npx tsc --noEmit`

```bash
git add src/modules/notifications
git commit -m "feat(notifications): BullMQ processor for dispatch + reminder jobs"
```

---

### Task 8: Module devices (đăng ký FCM token)

**Files:**
- Modify: `server/src/modules/devices/devices.module.ts` (hiện là `@Module({})` rỗng)
- Create: `server/src/modules/devices/devices.controller.ts`, `server/src/modules/devices/devices.service.ts`, `server/src/modules/devices/dto/register-device-token.dto.ts`
- Modify: `server/src/common/validation/vi-validation.factory.ts` (FIELD_LABELS)
- Test: `server/src/modules/devices/devices.service.spec.ts`

**Interfaces:**
- Produces: `POST /api/v1/devices/tokens` (body `{ token, platform, deviceName? }`), `DELETE /api/v1/devices/tokens/:token`; `DevicesService.register(userId, dto)`, `DevicesService.remove(userId, token)`.

- [ ] **Step 1: DTO**

```ts
import { DevicePlatform } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterDeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;

  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceName?: string;
}
```

Thêm nhãn vào `FIELD_LABELS` trong `vi-validation.factory.ts`: `token: 'Token thiết bị'`, `platform: 'Nền tảng'`, `deviceName: 'Tên thiết bị'` (theo đúng format các entry hiện có trong file).

- [ ] **Step 2: Test service (`devices.service.spec.ts`)**

```ts
import { DevicePlatform } from '@prisma/client';

import { DevicesService } from './devices.service';

describe('DevicesService', () => {
  let prisma: { deviceToken: { upsert: jest.Mock; deleteMany: jest.Mock } };
  let service: DevicesService;

  beforeEach(() => {
    prisma = {
      deviceToken: {
        upsert: jest.fn().mockResolvedValue({ id: 'd1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new DevicesService(prisma as never);
  });

  it('register upsert theo token, đổi chủ khi user khác đăng nhập cùng máy', async () => {
    await service.register('u1', {
      token: 'tok',
      platform: DevicePlatform.ANDROID,
      deviceName: 'Pixel',
    });
    expect(prisma.deviceToken.upsert).toHaveBeenCalledWith({
      where: { token: 'tok' },
      update: { userId: 'u1', platform: DevicePlatform.ANDROID, deviceName: 'Pixel' },
      create: {
        userId: 'u1',
        token: 'tok',
        platform: DevicePlatform.ANDROID,
        deviceName: 'Pixel',
      },
    });
  });

  it('remove chỉ xóa token thuộc user hiện tại', async () => {
    await service.remove('u1', 'tok');
    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: 'tok', userId: 'u1' },
    });
  });
});
```

- [ ] **Step 3: Chạy → FAIL, implement service + controller + module**

`devices.service.ts`:

```ts
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import type { RegisterDeviceTokenDto } from './dto/register-device-token.dto';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Upsert theo token: cùng máy đổi tài khoản → token chuyển chủ. */
  register(userId: string, dto: RegisterDeviceTokenDto) {
    return this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      update: {
        userId,
        platform: dto.platform,
        deviceName: dto.deviceName ?? null,
      },
      create: {
        userId,
        token: dto.token,
        platform: dto.platform,
        deviceName: dto.deviceName ?? null,
      },
    });
  }

  async remove(userId: string, token: string): Promise<null> {
    await this.prisma.deviceToken.deleteMany({ where: { token, userId } });
    return null;
  }
}
```

Lưu ý test Step 2 expect `deviceName: 'Pixel'` — khi dto có deviceName thì `dto.deviceName ?? null` = 'Pixel', khớp.

`devices.controller.ts`:

```ts
import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DevicesService } from './devices.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';

@ApiTags('Devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post('tokens')
  @ResponseMessage('Đăng ký thiết bị nhận thông báo thành công')
  @ApiOperation({ summary: 'Đăng ký FCM token của thiết bị hiện tại' })
  register(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    return this.devicesService.register(userId, dto);
  }

  @Delete('tokens/:token')
  @ResponseMessage('Hủy đăng ký thiết bị thành công')
  @ApiOperation({ summary: 'Hủy FCM token (gọi khi logout)' })
  remove(@CurrentUser('id') userId: string, @Param('token') token: string) {
    return this.devicesService.remove(userId, token);
  }
}
```

`devices.module.ts`:

```ts
import { Module } from '@nestjs/common';

import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

/** Thiết bị nhận FCM push — đăng ký/hủy device token. */
@Module({
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
```

- [ ] **Step 4: Test PASS + commit**

Run: `npx jest src/modules/devices && npx tsc --noEmit`

```bash
git add src/modules/devices src/common/validation/vi-validation.factory.ts
git commit -m "feat(devices): FCM device token registration endpoints"
```

---

### Task 9: Migrate 4 call site cũ sang notify() và xóa createForMembers

**Files:**
- Modify: `server/src/modules/sos/services/sos.service.ts:100`
- Modify: `server/src/modules/finance/services/finance.service.ts:3959` (đổi luôn type `GENERAL` → `FINANCE`)
- Modify: `server/src/modules/albums/album-tags.service.ts:101` (trong tx)
- Modify: `server/src/modules/albums/album-face-suggestions.service.ts:308` (trong tx)
- Modify: `server/src/modules/notifications/notifications.service.ts` (xóa `createForMembers`)
- Test: cập nhật mocks trong các spec: `sos.service.spec.ts`, `finance.service.spec.ts`, `spending-support-request.service.spec.ts`, `budget-alert.service.spec.ts`, `financial-goal.service.spec.ts`, `album-tags.service.spec.ts`, `album-face-suggestions.service.spec.ts`, `notifications.service.spec.ts`

- [ ] **Step 1: Sos + finance (ngoài tx) — thay tên hàm**

`sos.service.ts:100`: `createForMembers(` → `notify(` (giữ nguyên args — không có tham số client). `finance.service.ts:3959`: tương tự + đổi `NotificationType.GENERAL` → `NotificationType.FINANCE` trong object input đó.

- [ ] **Step 2: Albums (TRONG tx) — persist trong tx, dispatch sau commit**

`album-tags.service.ts` — method chứa dòng 101 có dạng `const tag = await this.prisma.$transaction(async (tx) => { ... })`. Sửa:

```ts
// Khai báo TRƯỚC $transaction:
let notificationIds: string[] = [];

// Trong tx, thay khối createForMembers(..., tx) bằng:
if (taggedMember.id !== requester.id) {
  const { ids } = await this.notifications.notify(
    workspaceId,
    [taggedMember.id],
    {
      type: NotificationType.ALBUM_TAG,
      priority: NotificationPriority.NORMAL,
      title: 'Bạn được gắn thẻ trong một nội dung album',
      body: `${this.displayName(created.taggedByMember)} đã gắn thẻ bạn trong một nội dung album gia đình.`,
      referenceType: 'ALBUM_MEDIA',
      referenceId: mediaId,
    },
    { tx },
  );
  notificationIds = ids;
}

// NGAY SAU khi $transaction trả về (trước return this.mapTag(...)):
await this.notifications.dispatch(notificationIds);
```

`album-face-suggestions.service.ts:308`: pattern y hệt (biến `notificationIds` ngoài tx, `notify(..., { tx })` trong tx, `dispatch` sau khi `const updated = await ...$transaction(...)` xong).

- [ ] **Step 3: Xóa `createForMembers` + interface giữ lại**

Xóa method `createForMembers` khỏi `notifications.service.ts` (GIỮ `CreateNotificationInput` — `notify` dùng). Xóa các test cũ của nó trong `notifications.service.spec.ts`.

- [ ] **Step 4: Cập nhật mocks trong 7 spec file**

Trong mỗi file spec liệt kê ở đầu task: thay `createForMembers: jest.fn().mockResolvedValue({ count: N })` bằng:

```ts
notify: jest.fn().mockResolvedValue({ ids: [] }),
dispatch: jest.fn().mockResolvedValue(undefined),
```

và các assertion `expect(notifications.createForMembers)...` → `expect(notifications.notify)...` (giữ nguyên matcher args; với 2 chỗ albums, arg thứ 4 đổi từ `tx` thành `{ tx }`).

- [ ] **Step 5: Grep sạch + full test**

Run: `grep -rn "createForMembers" src/` → Expected: 0 kết quả.
Run: `npm run test && npx tsc --noEmit`
Expected: PASS toàn bộ.

- [ ] **Step 6: Commit**

```bash
git add src/modules
git commit -m "refactor(notifications): migrate call sites to notify()/dispatch(), drop createForMembers"
```

---

### Task 10: Event join-requests + xóa thành viên

**Files:**
- Modify: `server/src/modules/join-requests/join-requests.service.ts`, `join-requests.module.ts`
- Modify: `server/src/modules/families/families.service.ts` (~dòng 159, nơi gọi `familyMembersService.remove`) + `families.module.ts`
- Test: `server/src/modules/join-requests/join-requests.service.spec.ts`

**Interfaces:**
- Consumes: `notify`, `notifyUsersEphemeral` (Task 4).
- Lưu ý: KHÔNG inject NotificationsService vào `FamilyMembersService` (NotificationsModule đã import FamilyMembersModule → sẽ tạo vòng module). Hook đặt ở TẦNG GỌI (`families.service.ts`).

- [ ] **Step 1: Import NotificationsModule + inject service**

`join-requests.module.ts` và `families.module.ts`: thêm `NotificationsModule` vào `imports`. Constructor 2 service thêm `private readonly notificationsService: NotificationsService`.

- [ ] **Step 2: Viết test cho join-requests (thêm vào spec hiện có, theo pattern mock của file)**

Case cần cover:
1. `create()` thành công → `notify` được gọi với recipient = các member MANAGER/DEPUTY ACTIVE, type `JOIN_REQUEST`, priority `HIGH`, referenceId = id request.
2. `approve()` thành công → `notify` gọi 2 lần (người được duyệt: type `JOIN_REQUEST`; các member khác: type `MEMBER`, priority `LOW`).
3. `reject()` thành công → `notifyUsersEphemeral` gọi với `[request.userId]`, type `JOIN_REQUEST`.
4. `create()` fail (đã là member) → không gọi notify.

```ts
// ví dụ assertion mẫu cho case 1:
expect(notifications.notify).toHaveBeenCalledWith(
  'family-1',
  ['manager-member-id'],
  expect.objectContaining({
    type: NotificationType.JOIN_REQUEST,
    priority: NotificationPriority.HIGH,
    referenceType: 'JOIN_REQUEST',
  }),
);
```

- [ ] **Step 3: Chạy → FAIL, rồi implement trong `join-requests.service.ts`**

Cuối `create()` (sau `this.prisma.joinRequest.create`, đổi thành gán `const request = await ...` rồi):

```ts
    const requester = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, email: true },
    });
    const approvers = await this.prisma.familyMember.findMany({
      where: {
        familyId: family.id,
        status: MemberStatus.ACTIVE,
        familyRole: {
          in: [FamilyRole.FAMILY_MANAGER, FamilyRole.DEPUTY_MEMBER],
        },
      },
      select: { id: true },
    });
    await this.notificationsService.notify(
      family.id,
      approvers.map((m) => m.id),
      {
        type: NotificationType.JOIN_REQUEST,
        priority: NotificationPriority.HIGH,
        title: 'Yêu cầu tham gia mới',
        body: `${requester?.fullName ?? requester?.email ?? 'Một người dùng'} muốn tham gia gia đình ${family.name}.`,
        referenceType: 'JOIN_REQUEST',
        referenceId: request.id,
      },
    );
    return request;
```

(Import thêm `FamilyRole`, `NotificationType`, `NotificationPriority` từ `@prisma/client` nếu chưa có; `familyPreviewSelect` phải chứa `name` — kiểm tra, nếu thiếu thì select thêm name khi cần.)

Cuối `approve()` (sau `$transaction` thành công, trước `return member`):

```ts
      const familyName = await this.prisma.family.findUnique({
        where: { id: familyId },
        select: { name: true },
      });
      await this.notificationsService.notify(familyId, [member.id], {
        type: NotificationType.JOIN_REQUEST,
        priority: NotificationPriority.NORMAL,
        title: 'Yêu cầu tham gia được duyệt',
        body: `Bạn đã trở thành thành viên của gia đình ${familyName?.name ?? ''}.`,
        referenceType: 'FAMILY',
        referenceId: familyId,
      });
      const others = await this.prisma.familyMember.findMany({
        where: {
          familyId,
          status: MemberStatus.ACTIVE,
          id: { not: member.id },
        },
        select: { id: true },
      });
      const newMemberUser = await this.prisma.user.findUnique({
        where: { id: request.userId },
        select: { fullName: true, email: true },
      });
      await this.notificationsService.notify(
        familyId,
        others.map((m) => m.id),
        {
          type: NotificationType.MEMBER,
          priority: NotificationPriority.LOW,
          title: 'Thành viên mới',
          body: `${newMemberUser?.fullName ?? newMemberUser?.email ?? 'Một thành viên mới'} vừa tham gia gia đình.`,
          referenceType: 'FAMILY_MEMBER',
          referenceId: member.id,
        },
      );
      return member;
```

Cuối `reject()` (sau update thành công, đổi `return await ...update` thành gán biến `updated` rồi):

```ts
      await this.notificationsService.notifyUsersEphemeral([request.userId], {
        familyId: null,
        type: NotificationType.JOIN_REQUEST,
        priority: NotificationPriority.NORMAL,
        title: 'Yêu cầu tham gia bị từ chối',
        body: 'Yêu cầu tham gia gia đình của bạn đã bị từ chối.',
        referenceType: 'JOIN_REQUEST',
        referenceId: updated.id,
      });
      return updated;
```

- [ ] **Step 4: Hook xóa thành viên trong `families.service.ts`**

Tại nơi gọi `await this.familyMembersService.remove(familyId, targetUserId)` (~dòng 159): lấy membership TRƯỚC khi remove (nếu method chưa có sẵn biến membership của target — xem code xung quanh, thường đã fetch để validate):

```ts
    const removedMember = await this.familyMembersService.remove(
      familyId,
      targetUserId,
    );
    // Persist cho các manager; người bị xóa nhận push-only (membership đã REMOVED,
    // không đọc được notification trong family nữa).
    const managers = await this.prisma.familyMember.findMany({
      where: {
        familyId,
        status: MemberStatus.ACTIVE,
        familyRole: {
          in: [FamilyRole.FAMILY_MANAGER, FamilyRole.DEPUTY_MEMBER],
        },
      },
      select: { id: true },
    });
    await this.notificationsService.notify(
      familyId,
      managers.map((m) => m.id),
      {
        type: NotificationType.MEMBER,
        priority: NotificationPriority.NORMAL,
        title: 'Thành viên đã bị xóa',
        body: 'Một thành viên đã bị xóa khỏi gia đình.',
        referenceType: 'FAMILY_MEMBER',
        referenceId: removedMember.id,
      },
    );
    await this.notificationsService.notifyUsersEphemeral([targetUserId], {
      familyId: null,
      type: NotificationType.MEMBER,
      priority: NotificationPriority.NORMAL,
      title: 'Bạn đã bị xóa khỏi gia đình',
      body: 'Bạn không còn là thành viên của gia đình này.',
      referenceType: 'FAMILY',
      referenceId: familyId,
    });
```

(Điều chỉnh theo code thực tế của method: nếu đã có sẵn danh sách manager hoặc tên family/tên member trong scope thì dùng để body cụ thể hơn — message tiếng Việt.)

- [ ] **Step 5: Test PASS + commit**

Run: `npx jest src/modules/join-requests src/modules/families && npx tsc --noEmit`

```bash
git add src/modules/join-requests src/modules/families
git commit -m "feat(notifications): join request + member removal events"
```

---

### Task 11: Event tasks + chat

**Files:**
- Modify: `server/src/modules/tasks/services/tasks.service.ts` + `tasks.module.ts`
- Modify: `server/src/modules/chats/services/messages.service.ts` + `chats.module.ts`
- Test: thêm case vào `tasks.service.spec.ts` (theo pattern mock hiện có của file)

**Interfaces:**
- Consumes: `notify`, `notifyUsersEphemeral`.

- [ ] **Step 1: Wire module** — `tasks.module.ts`, `chats.module.ts`: thêm `NotificationsModule` vào imports; inject `NotificationsService` vào `TasksService`, `MessagesService`.

- [ ] **Step 2: Tasks — 3 hook (tất cả NGOÀI tx, gọi notify thẳng)**

a) `createTaskAssignment` (tasks.service.ts:1109) — sau khi tạo assignment thành công, trước `return`:

```ts
    await this.notificationsService.notify(
      familyId,
      [dto.assignedToMemberId],
      {
        type: NotificationType.TASK,
        priority: NotificationPriority.NORMAL,
        title: 'Bạn được giao công việc mới',
        body: `Bạn được giao công việc "${task.title}".`,
        referenceType: 'TASK_ASSIGNMENT',
        referenceId: assignment.id,
      },
    );
```

b) Method re-assign (vùng dòng ~1301-1330, nơi tạo assignment mới với `status: TaskAssignmentStatus.ASSIGNED`): thêm khối notify y hệt (a) với id assignment mới.

c) Task hoàn thành: grep `TaskAssignmentStatus.APPROVED` trong tasks.service.ts để tìm method duyệt submission (nơi `data: { status: TaskAssignmentStatus.APPROVED ... }`). Sau update thành công, notify người ĐƯỢC GIAO (không phải người duyệt):

```ts
    await this.notificationsService.notify(
      familyId,
      [assignment.assignedToMemberId],
      {
        type: NotificationType.TASK,
        priority: NotificationPriority.LOW,
        title: 'Công việc được nghiệm thu',
        body: `Công việc "${task.title}" của bạn đã được duyệt hoàn thành.`,
        referenceType: 'TASK_ASSIGNMENT',
        referenceId: assignment.id,
      },
    );
```

(Nếu biến trong scope tên khác (`submission.assignment...`) thì bám theo code thực tế; nguyên tắc: recipient = `assignedToMemberId`, reference = assignment id. Nếu update chạy TRONG tx thì chuyển sang pattern `notify(..., { tx })` + `dispatch` sau commit như Task 9 Step 2.)

- [ ] **Step 3: Chat — push-only trong `messages.service.send`**

Sau khi `const message = await this.prisma.$transaction(...)` hoàn tất (KHÔNG trong tx — đây là push-only, không persist, nên không cần tx), trước `return`:

```ts
    const otherParticipants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, memberId: { not: memberId } },
      select: { member: { select: { userId: true, displayName: true } } },
    });
    const senderName =
      message.senderMember?.displayName ??
      message.senderMember?.user?.fullName ??
      'Tin nhắn mới';
    await this.notificationsService.notifyUsersEphemeral(
      otherParticipants.map((p) => p.member.userId),
      {
        familyId: workspaceId,
        type: NotificationType.CHAT,
        priority: NotificationPriority.NORMAL,
        title: senderName,
        body: content ?? '[Đính kèm]',
        referenceType: 'CONVERSATION',
        referenceId: conversationId,
      },
    );
```

(Kiểm tra shape `messageInclude` của file để lấy đúng đường dẫn tên người gửi; nếu participant có cột trạng thái rời nhóm (`leftAt`/status) thì thêm điều kiện loại họ ra — xem model `ConversationParticipant` trong schema. FE đang mở đúng conversation tự bỏ qua toast dựa trên `referenceId`.)

- [ ] **Step 4: Test tasks case (a): thêm vào `tasks.service.spec.ts` mock `notifications = { notify: jest.fn().mockResolvedValue({ ids: [] }), notifyUsersEphemeral: jest.fn(), dispatch: jest.fn() }`, assert notify được gọi với type TASK khi tạo assignment.**

- [ ] **Step 5: Test PASS + commit**

Run: `npx jest src/modules/tasks src/modules/chats && npx tsc --noEmit`

```bash
git add src/modules/tasks src/modules/chats
git commit -m "feat(notifications): task assignment/completion + chat message events"
```

---

### Task 12: Event finance — budget alert + goal đạt mốc

**Files:**
- Modify: `server/src/modules/finance/services/finance.service.ts` (2 chỗ `tx.budgetAlert.create`: dòng ~2938 và ~3902)
- Modify: service quản lý goal allocation (grep `goalAllocation.create` trong `finance/services/` — nằm trong finance.service.ts hoặc financial-goal.service.ts)
- Test: thêm case vào spec tương ứng của service bị sửa

**Interfaces:**
- Consumes: `notify(..., { tx })` + `dispatch(ids)` sau commit (quy ước Task 4).

- [ ] **Step 1: Budget alert (2 chỗ, TRONG tx)**

Tại mỗi chỗ `await tx.budgetAlert.create({ data: ... })`: gán kết quả `const alert = await tx.budgetAlert.create(...)`, rồi ngay sau đó trong tx:

```ts
        const alertRecipients = await tx.familyMember.findMany({
          where: {
            familyId,
            status: MemberStatus.ACTIVE,
            familyRole: {
              in: [FamilyRole.FAMILY_MANAGER, FamilyRole.DEPUTY_MEMBER],
            },
          },
          select: { id: true },
        });
        const { ids } = await this.notificationsService.notify(
          familyId,
          alertRecipients.map((m) => m.id),
          {
            type: NotificationType.FINANCE,
            priority: NotificationPriority.HIGH,
            title: 'Cảnh báo ngân sách',
            body: 'Chi tiêu đã vượt ngưỡng cảnh báo của một dòng ngân sách.',
            referenceType: 'BUDGET_ALERT',
            referenceId: alert.id,
          },
          { tx },
        );
        pendingNotificationIds.push(...ids);
```

Khai báo `const pendingNotificationIds: string[] = [];` TRƯỚC `$transaction` bao ngoài, và SAU khi transaction commit thành công: `await this.notificationsService.dispatch(pendingNotificationIds);`. (Bám code thật: nếu `familyId` trong scope tên khác — ledger/budget object — dùng đúng biến; nội dung body nên chèn tên budget line nếu có sẵn trong scope.)

- [ ] **Step 2: Goal đạt mốc (chỉ notify khi VƯỢT QUA mốc — chống lặp)**

Trong method tạo goal allocation (nơi có `goalAllocation.create`): method này đã dùng helper `calculateGoalAllocatedAmount`. Thêm logic:

```ts
    // allocatedBefore lấy TRƯỚC khi tạo allocation, allocatedAfter = before + amount.
    const reachedTarget =
      allocatedBefore.lt(goal.targetAmount) &&
      allocatedAfter.gte(goal.targetAmount);
```

Nếu `reachedTarget` → sau commit (hoặc trong tx với pattern `{ tx }` + dispatch sau):

```ts
      const allMembers = await this.prisma.familyMember.findMany({
        where: { familyId, status: MemberStatus.ACTIVE },
        select: { id: true },
      });
      await this.notificationsService.notify(
        familyId,
        allMembers.map((m) => m.id),
        {
          type: NotificationType.FINANCE,
          priority: NotificationPriority.NORMAL,
          title: 'Mục tiêu tài chính đã đạt',
          body: `Mục tiêu "${goal.name}" đã đạt số tiền đề ra.`,
          referenceType: 'FINANCIAL_GOAL',
          referenceId: goal.id,
        },
      );
```

(Decimal so sánh bằng `Prisma.Decimal.lt/gte` như code finance hiện dùng.)

- [ ] **Step 3: Test — thêm case vào spec của service bị sửa: tạo allocation vượt mốc → notify được gọi với type FINANCE; allocation chưa tới mốc → không gọi. Budget alert tạo trong tx → notify gọi với `{ tx }` và dispatch gọi sau đó.**

- [ ] **Step 4: Test PASS + commit**

Run: `npx jest src/modules/finance && npx tsc --noEmit`

```bash
git add src/modules/finance
git commit -m "feat(notifications): budget alert + financial goal milestone events"
```

---

### Task 13: RemindersService — task đến hạn + sự kiện lịch (repeatable job)

**Files:**
- Modify: `server/src/modules/notifications/reminders.service.ts` (thay stub Task 7)
- Modify: `server/src/modules/notifications/notifications.module.ts` (nếu cần — RemindersService đã là provider)
- Test: `server/src/modules/notifications/reminders.service.spec.ts`

**Interfaces:**
- Consumes: `notify` (Task 4), queue `NOTIFICATIONS_QUEUE`, fields `reminderSentAt` (Task 2).
- Produces: `RemindersService.scan(): Promise<void>`; repeatable job `reminder-scan` 5 phút/lần (đăng ký `onApplicationBootstrap`).

- [ ] **Step 1: Test (`reminders.service.spec.ts`)**

```ts
import { TaskAssignmentStatus } from '@prisma/client';

import { RemindersService } from './reminders.service';

describe('RemindersService.scan', () => {
  let prisma: {
    taskAssignment: { findMany: jest.Mock; updateMany: jest.Mock };
    calendarEventParticipant: { findMany: jest.Mock; updateMany: jest.Mock };
  };
  let notifications: { notify: jest.Mock };
  let queue: { upsertJobScheduler: jest.Mock };
  let service: RemindersService;

  beforeEach(() => {
    prisma = {
      taskAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a1',
            assignedToMemberId: 'm1',
            dueAt: new Date(Date.now() + 10 * 60_000),
            task: { familyId: 'f1', title: 'Rửa bát' },
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      calendarEventParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    notifications = { notify: jest.fn().mockResolvedValue({ ids: ['n1'] }) };
    queue = { upsertJobScheduler: jest.fn() };
    service = new RemindersService(
      prisma as never,
      notifications as never,
      queue as never,
    );
  });

  it('nhắc task sắp đến hạn rồi đóng dấu reminderSentAt', async () => {
    await service.scan();
    expect(notifications.notify).toHaveBeenCalledWith(
      'f1',
      ['m1'],
      expect.objectContaining({ referenceType: 'TASK_ASSIGNMENT', referenceId: 'a1' }),
    );
    expect(prisma.taskAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a1'] } },
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it('không có gì đến hạn → không notify, không update', async () => {
    prisma.taskAssignment.findMany.mockResolvedValue([]);
    await service.scan();
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(prisma.taskAssignment.updateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Chạy → FAIL, implement**

```ts
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import {
  CalendarEventStatus,
  NotificationPriority,
  NotificationType,
  TaskAssignmentStatus,
} from '@prisma/client';
import type { Queue } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import {
  NOTIFICATIONS_QUEUE,
  REMINDER_SCAN_JOB,
} from './notifications.types';

const REMINDER_WINDOW_MS = 30 * 60_000; // nhắc trước 30 phút
const SCAN_INTERVAL_MS = 5 * 60_000; // quét 5 phút/lần

/**
 * Quét task/sự kiện sắp đến hạn và bắn notification nhắc. Idempotent nhờ cột
 * `reminderSentAt` (chỉ lấy row chưa đóng dấu). Chạy bằng BullMQ repeatable
 * job nên an toàn khi nhiều instance (BullMQ tự lock).
 */
@Injectable()
export class RemindersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        REMINDER_SCAN_JOB,
        { every: SCAN_INTERVAL_MS },
        { name: REMINDER_SCAN_JOB },
      );
    } catch (err) {
      this.logger.error(
        `Không thể đăng ký reminder scheduler: ${(err as Error).message}`,
      );
    }
  }

  async scan(): Promise<void> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS);
    await this.scanTaskAssignments(now, windowEnd);
    await this.scanCalendarEvents(now, windowEnd);
  }

  private async scanTaskAssignments(now: Date, windowEnd: Date): Promise<void> {
    const due = await this.prisma.taskAssignment.findMany({
      where: {
        reminderSentAt: null,
        dueAt: { gt: now, lte: windowEnd },
        status: {
          in: [TaskAssignmentStatus.ASSIGNED, TaskAssignmentStatus.IN_PROGRESS],
        },
      },
      select: {
        id: true,
        assignedToMemberId: true,
        dueAt: true,
        task: { select: { familyId: true, title: true } },
      },
    });
    if (due.length === 0) {
      return;
    }
    for (const assignment of due) {
      await this.notificationsService.notify(
        assignment.task.familyId,
        [assignment.assignedToMemberId],
        {
          type: NotificationType.TASK,
          priority: NotificationPriority.HIGH,
          title: 'Công việc sắp đến hạn',
          body: `Công việc "${assignment.task.title}" sẽ đến hạn trong 30 phút tới.`,
          referenceType: 'TASK_ASSIGNMENT',
          referenceId: assignment.id,
        },
      );
    }
    await this.prisma.taskAssignment.updateMany({
      where: { id: { in: due.map((a) => a.id) } },
      data: { reminderSentAt: new Date() },
    });
  }

  private async scanCalendarEvents(now: Date, windowEnd: Date): Promise<void> {
    const upcoming = await this.prisma.calendarEventParticipant.findMany({
      where: {
        reminderSentAt: null,
        reminderEnabled: true,
        event: {
          status: CalendarEventStatus.ACTIVE,
          startTime: { gt: now, lte: windowEnd },
        },
      },
      select: {
        id: true,
        memberId: true,
        event: { select: { id: true, workspaceId: true, title: true } },
      },
    });
    if (upcoming.length === 0) {
      return;
    }
    for (const participant of upcoming) {
      await this.notificationsService.notify(
        participant.event.workspaceId,
        [participant.memberId],
        {
          type: NotificationType.CALENDAR,
          priority: NotificationPriority.HIGH,
          title: 'Sự kiện sắp diễn ra',
          body: `Sự kiện "${participant.event.title}" sẽ bắt đầu trong 30 phút tới.`,
          referenceType: 'CALENDAR_EVENT',
          referenceId: participant.event.id,
        },
      );
    }
    await this.prisma.calendarEventParticipant.updateMany({
      where: { id: { in: upcoming.map((p) => p.id) } },
      data: { reminderSentAt: new Date() },
    });
  }
}
```

(Constructor đổi so với stub Task 7 → cập nhật `notifications.processor.spec.ts` nếu cần. Lưu ý test Step 1 khởi tạo `new RemindersService(prisma, notifications, queue)` — thứ tự tham số phải khớp.)

- [ ] **Step 3: Test PASS + commit**

Run: `npx jest src/modules/notifications && npx tsc --noEmit`

```bash
git add src/modules/notifications
git commit -m "feat(notifications): due task + calendar event reminders via repeatable job"
```

---

### Task 14: Script test WS tay + tài liệu + verify tổng

**Files:**
- Create: `server/scripts/notifications-ws-test.mjs`
- Create: `server/src/modules/notifications/NOTIFICATIONS_REALTIME.md` (FE contract)
- Modify: `CLAUDE.md` (mục 4: cập nhật trạng thái notifications/devices; bảng DB thêm `device_tokens`)

- [ ] **Step 1: Script test tay** — mô phỏng theo `scripts/sos-ws-test.mjs` có sẵn (đọc file đó lấy pattern login + connect):

```js
// Usage: node scripts/notifications-ws-test.mjs <email> <password>
// Login → connect /notifications → in ra mọi notification:new / unread-count.
import { io } from 'socket.io-client';

const BASE = process.env.API_BASE ?? 'http://localhost:3000';
const [email, password] = process.argv.slice(2);

const res = await fetch(`${BASE}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const json = await res.json();
if (!json.success) {
  console.error('Login thất bại:', json.message);
  process.exit(1);
}
const token = json.data.accessToken;

const socket = io(`${BASE}/notifications`, { auth: { token } });
socket.on('connect', () => console.log('✅ connected', socket.id));
socket.on('notification:new', (n) => console.log('🔔 new:', n));
socket.on('notification:unread-count', (c) => console.log('🔢 unread:', c));
socket.on('notification:error', (e) => console.log('❌ error:', e));
socket.on('disconnect', (r) => console.log('disconnected:', r));
```

(Đối chiếu path field accessToken với response login thật của repo — xem sos-ws-test.mjs.)

- [ ] **Step 2: Viết `NOTIFICATIONS_REALTIME.md`** — FE contract, theo format `SOS_REALTIME.md` có sẵn. Nội dung bắt buộc: cách connect (`/notifications`, auth.token), 3 event (`notification:new`, `notification:unread-count`, `notification:error`) + shape payload (`NotificationPayload` với `id` nullable + ý nghĩa push-only), REST đi kèm (list, unread-count, mark read), API devices đăng ký FCM token, bảng NotificationType → màn điều hướng theo `referenceType`/`referenceId`.

- [ ] **Step 3: Cập nhật `CLAUDE.md`** mục 4: chuyển `notifications`, `devices` khỏi danh sách stub; thêm dòng mô tả ngắn (funnel notify/dispatch + quy ước tx; WS `/notifications`; BullMQ/Redis); thêm `device_tokens` vào danh sách bảng DB.

- [ ] **Step 4: Verify tổng — chạy đủ trước khi báo xong**

```bash
npx prisma validate && npx tsc --noEmit && npm run lint && npm run test
```

Expected: tất cả PASS.

E2E tay (cần Redis đang chạy + 2 tài khoản có sẵn): terminal 1 `npm run start:dev`; terminal 2 `node scripts/notifications-ws-test.mjs <manager-email> <pass>`; terminal 3 dùng Swagger/curl tạo join request bằng invite code của family → terminal 2 phải in `🔔 new:` với type `JOIN_REQUEST` trong ~1-2 giây.

- [ ] **Step 5: Commit**

```bash
git add scripts/notifications-ws-test.mjs src/modules/notifications/NOTIFICATIONS_REALTIME.md ../CLAUDE.md
git commit -m "docs(notifications): FE realtime contract + ws test script"
```
