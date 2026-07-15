# Thiết kế: Notifications realtime toàn hệ thống (WS + FCM)

- **Ngày:** 2026-07-15
- **Trạng thái:** Đã duyệt thiết kế, chờ implementation plan
- **Phạm vi:** `server/` (NestJS). FE/mobile chỉ nhận contract, không nằm trong scope.

## 1. Bối cảnh & mục tiêu

Hiện tại module `notifications` đã có: bảng `notifications`, `NotificationsService.createForMembers()`
fan-out 1 row/người nhận, REST API list + mark-read tại `families/:familyId/notifications`.
SOS, finance (spending support), albums (tag + face suggestion) đã gọi vào funnel này.
**Thiếu:** kênh đẩy realtime (client phải polling) và độ phủ event (join request, tasks,
calendar, finance alerts, chat chưa bắn notification).

**Mục tiêu:**
1. Client nhận notification tức thì qua WebSocket khi app đang mở.
2. Nhận push FCM khi app tắt (mobile đăng ký device token).
3. Phủ đủ 4 nhóm event mới: join request/thành viên, tasks & calendar, finance mở rộng, chat.
4. Kiến trúc channel plugin — thêm kênh mới (email…) không sửa module nghiệp vụ.

## 2. Kiến trúc đã chốt (phương án A+)

Dispatcher tập trung + BullMQ/Redis cho khâu gửi. Đã cân nhắc và loại:
- **A thuần (gửi inline sau commit):** gửi FCM trong HTTP request là anti-pattern production
  (chậm, không retry).
- **B (@nestjs/event-emitter):** in-process, không bền hơn gọi trực tiếp, chỉ thêm indirection.
- **C (transactional outbox):** durability bank-grade, quá tay — DB-first đã đảm bảo không mất
  notification, xấu nhất chỉ mất cú đẩy realtime.

```
Feature module ─▶ NotificationsService.notify()
                    │ 1. Persist rows (dùng tx của caller nếu có)
                    │ 2. SAU COMMIT: enqueue job vào queue 'notifications'
                    ▼
NotificationsProcessor (BullMQ worker, cùng app, retry 3 lần backoff từ 5s)
                    ▼
NotificationDispatcher
                    ├── WsNotificationChannel  → NotificationsGateway (/notifications)
                    └── FcmNotificationChannel → firebase-admin → device_tokens
```

**Nguyên tắc bất biến:** DB là source of truth. WS/FCM/Redis lỗi → notification vẫn nằm trong DB,
client thấy khi fetch. Lỗi notification KHÔNG được làm chết nghiệp vụ chính (enqueue fail chỉ log,
không throw ra caller).

## 3. Cấu trúc file

```
modules/notifications/
├── notifications.module.ts        # sửa: đăng ký gateway, queue, dispatcher, channels
├── notifications.controller.ts    # giữ nguyên + thêm GET unread-count
├── notifications.service.ts       # sửa: thêm notify() + dispatch(); giữ createForMembers
├── notifications.gateway.ts       # MỚI: WS namespace /notifications
├── notifications.processor.ts     # MỚI: BullMQ worker
└── dispatcher/
    ├── notification-dispatcher.ts    # MỚI
    ├── notification-channel.ts       # MỚI: interface NotificationChannel
    ├── ws-notification.channel.ts    # MỚI
    └── fcm-notification.channel.ts   # MỚI

modules/devices/                   # từ stub → module thật
├── devices.module.ts / devices.controller.ts / devices.service.ts
└── dto/register-device.dto.ts

common/ws/ws-auth.util.ts          # MỚI: xác thực JWT handshake dùng chung
```

Hạ tầng: service `redis` trong `docker-compose.yml` + `docker-compose.prod.yml`.
Deps mới: `@nestjs/bullmq`, `bullmq`, `firebase-admin`.
ENV mới: `REDIS_HOST`, `REDIS_PORT`, `FIREBASE_SERVICE_ACCOUNT` (base64 service-account JSON).

## 4. Thay đổi schema (1 migration)

1. **Enum `NotificationType`** thêm: `JOIN_REQUEST`, `MEMBER`, `TASK`, `CALENDAR`, `FINANCE`,
   `CHAT` (giữ `SOS`, `GENERAL`, `ALBUM_TAG`; spending support đổi từ `GENERAL` → `FINANCE`).
2. **Model `DeviceToken`** (bảng `device_tokens`): `id`, `userId` (FK users, cascade),
   `token` (unique), `platform` (enum `DevicePlatform`: `ANDROID|IOS|WEB`), `deviceName?`,
   `lastSeenAt`, `createdAt`. Index theo `userId`. Gắn theo **user** (không theo member) —
   1 user nhận notification của mọi family mình tham gia.
3. **Chống gửi trùng reminder:** thêm `reminderSentAt DateTime?` vào `TaskAssignment`
   và `CalendarEventParticipant`. Job quét chỉ lấy row `reminderSentAt IS NULL` và đến hạn
   trong 30 phút tới; gửi xong set timestamp → idempotent, restart không gửi lại.

## 5. Bản đồ event → notification

| Event | Call site | Người nhận | Type / Priority |
|---|---|---|---|
| Join request mới | `join-requests.service` (create) | MANAGER + DEPUTY | `JOIN_REQUEST` / HIGH |
| Duyệt join request | `join-requests.service` | Người xin vào (đã thành member) | `JOIN_REQUEST` / NORMAL |
| Từ chối join request | `join-requests.service` | Người xin vào — **push-only theo userId, không persist** (chưa là member, không có `recipientMemberId`) | `JOIN_REQUEST` / NORMAL |
| Thành viên mới vào | `join-requests.service` (sau approve) | Mọi member khác | `MEMBER` / LOW |
| Member bị xóa / rời | `family-members.service` | MANAGER + người bị ảnh hưởng | `MEMBER` / NORMAL |
| Được giao task | `tasks` services (create assignment) | Member được giao | `TASK` / NORMAL |
| Task đến hạn (30' trước `dueAt`) | Job quét định kỳ | Member được giao | `TASK` / HIGH |
| Task hoàn thành | `tasks` services | Người giao việc | `TASK` / LOW |
| Sự kiện lịch sắp diễn ra (30' trước `startTime`) | Job quét định kỳ | Participant có `reminderEnabled` | `CALENDAR` / HIGH |
| Budget vượt ngưỡng | `finance` (chỗ tạo `BudgetAlert`) | MANAGER + DEPUTY | `FINANCE` / HIGH |
| Goal đạt mốc | `finance` (goal allocation) | Mọi member | `FINANCE` / NORMAL |
| Tin nhắn chat mới | `chats/services/messages.service` (create) | Participant khác trong conversation | `CHAT` / NORMAL — **push-only, không persist** |

- **Job quét định kỳ:** BullMQ **repeatable job** chạy 5 phút/lần (không thêm `@nestjs/schedule`;
  BullMQ tự lock nên an toàn khi sau này chạy nhiều instance). Quét cả task due lẫn calendar event.
- **Ghi chú calendar:** module `calendar` còn stub nhưng schema `CalendarEvent`/
  `CalendarEventParticipant` đã có. Job reminder hoạt động trên dữ liệu bảng này; API CRUD calendar
  nằm ngoài scope đợt này.
- **Chat push-only có chủ đích:** không persist 1 row/tin nhắn (giống Messenger/Zalo — badge chat
  đếm từ bảng messages). Dispatcher nhận cờ `persist: false` → chỉ emit WS + FCM.

## 6. NotificationsGateway (namespace `/notifications`)

- Auth handshake giống SOS/chat: JWT access token (`auth.token` hoặc header), verify
  `jwt.accessSecret`, yêu cầu `accountStatus === ACTIVE`. Dùng helper chung
  `common/ws/ws-auth.util.ts`. (`SosGateway`/`ChatsGateway` migrate sang helper này SAU,
  ngoài scope.)
- Connect thành công → tự join room `user:<userId>`. Không có message join thủ công.
- Event đẩy xuống:
  - `notification:new` — notification vừa tạo (`id`, `type`, `priority`, `title`, `body`,
    `referenceType`, `referenceId`, `familyId`, `createdAt`). Push-only thì `id: null`.
  - `notification:unread-count` — `{ familyId, count }`, đẩy sau mỗi `notification:new` và
    sau mark-read/mark-all-read.
- Resolve người nhận: rows lưu `recipientMemberId` → worker query `family_members`
  (`id IN (...)`) lấy `userId` → emit vào từng room `user:<userId>`.

## 7. FcmNotificationChannel & module devices

- `firebase-admin` khởi tạo 1 lần từ `FIREBASE_SERVICE_ACCOUNT` (base64). **Thiếu ENV →
  channel tự disable + log warning, app vẫn chạy** (dev không cần Firebase).
- Gửi `sendEachForMulticast` tới mọi token của các user nhận. Token bị Google báo
  `registration-token-not-registered` / `invalid-registration-token` → xóa row tương ứng.
- Payload: `notification` (title/body) + `data` (type, referenceType, referenceId, familyId).
  Priority `HIGH`/`CRITICAL` → FCM priority `high`.
- API devices (`JwtAuthGuard`, message tiếng Việt):
  - `POST /devices/tokens` — upsert theo `token`; token đã thuộc user khác → chuyển chủ
    (trường hợp đổi tài khoản trên cùng máy).
  - `DELETE /devices/tokens/:token` — hủy khi logout (chỉ xóa nếu token thuộc user hiện tại).

## 8. Quy ước transaction (BẮT BUỘC cho mọi call site)

`NotificationsService` public API:

```ts
// Persist (tx-aware) + enqueue. Nếu opts.tx có mặt: CHỈ persist, trả về ids — caller phải
// tự gọi dispatch(ids) sau khi $transaction commit.
notify(familyId, recipientMemberIds, input, opts?: { tx?; persist? }): Promise<{ ids }>
// Enqueue job dispatch cho các notification đã persist (gọi sau commit).
dispatch(notificationIds: string[]): Promise<void>
// Push-only (chat, reject join request): không persist, enqueue payload ephemeral theo userIds.
notifyUsersEphemeral(userIds: string[], payload): Promise<void>
```

- Caller KHÔNG trong transaction → gọi `notify()` là đủ (tự persist + enqueue).
- Caller TRONG `prisma.$transaction` → truyền `opts.tx`, rồi gọi `dispatch(ids)` **ngay sau khi
  transaction kết thúc thành công**. Enqueue trong tx là BUG (tx rollback → đẩy notification "ma").
- `createForMembers` cũ giữ nguyên hành vi trong giai đoạn chuyển tiếp; các call site cũ
  (sos, finance, albums) migrate sang `notify`/`dispatch` trong đợt này rồi xóa method cũ.

## 9. Queue & xử lý lỗi

- Queue `notifications`, worker chạy trong cùng app NestJS (`@nestjs/bullmq` processor).
- Job: `{ notificationIds }` hoặc `{ ephemeral: { userIds, payload } }`.
- Retry 3 lần, exponential backoff từ 5s; job fail giữ 24h trong Redis để debug.
- Trong worker: WS channel chạy trước (rẻ, in-process), FCM sau; lỗi channel này không chặn
  channel kia (catch riêng từng channel, log lỗi).
- Redis không kết nối được lúc enqueue → log error, không throw ra caller.

## 10. Testing

- Unit (theo pattern spec hiện có): `notify`/`dispatch` (2 nhánh tx), processor (mock channels),
  FCM channel (mock firebase-admin + case dọn token chết), devices service (upsert/đổi chủ).
- Cập nhật ~6 file spec đang mock `createForMembers` → mock API mới.
- Script test tay `scripts/notifications-ws-test.mjs` (theo mẫu `sos-ws-test.mjs`): 2 user
  connect, tạo join request, xác nhận `notification:new` nhận được realtime.

## 11. Mức độ ảnh hưởng code hiện tại

| Vùng | Mức độ |
|---|---|
| `modules/notifications` | Sửa lớn — chủ yếu THÊM file mới; service thêm method |
| `modules/devices` | Stub → module thật (nhỏ, độc lập) |
| Schema | 1 migration (enum + `device_tokens` + 2 cột `reminderSentAt`) |
| Call site cũ (sos, finance, albums) | Sửa nhẹ, vài dòng/chỗ |
| Call site mới (join-requests, family-members, tasks, chats, finance) | Thêm inject + gọi `notify` |
| Hạ tầng | Redis vào 2 file compose; 3 deps; ENV mới |
| API hiện hữu, `SosGateway`, `ChatsGateway` | KHÔNG breaking change |

## 12. Ngoài scope (ghi nhận cho phase sau)

- Migrate `SosGateway`/`ChatsGateway` sang `ws-auth.util.ts`.
- Email channel; user preference tắt/bật từng loại notification; mute conversation.
- Socket.io Redis adapter khi chạy nhiều instance API.
- API CRUD module `calendar` (job reminder đã sẵn sàng chạy trên schema có sẵn).
- Nâng cấp transactional outbox nếu tách microservice (ghi vào báo cáo là hướng phát triển).
