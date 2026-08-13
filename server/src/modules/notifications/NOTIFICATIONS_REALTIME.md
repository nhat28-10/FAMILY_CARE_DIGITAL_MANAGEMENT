# Notifications Realtime — Hợp đồng sự kiện WebSocket (cho FE)

Kênh realtime notification cá nhân chạy trên **Socket.IO**, namespace **`/notifications`**
(vd `http://localhost:3000/notifications`). Khác với `/sos` (theo dõi 1 alert trong 1
family/workspace), kênh này là **luồng thông báo xuyên suốt tài khoản**: mọi family user
đang là thành viên, mọi thiết bị đang mở, đều nhận qua cùng 1 kết nối.

## Kết nối & xác thực

Gửi access token (JWT 15') khi handshake — giống lớp HTTP:

```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:3000/notifications', {
  auth: { token: accessToken },
});
// hoặc header: Authorization: Bearer <accessToken>
```

- Kết nối thành công → server **tự động join** socket vào room `user:<userId>` — **không**
  có message join thủ công nào cả (khác với `/sos` cần `sos:join`).
- Token hết hạn / tài khoản không `ACTIVE` → server phát `notification:error` rồi
  **ngắt kết nối**.
- Token 15' hết hạn → client cần **refresh token và reconnect** (khi `connect_error`/
  `disconnect`, lấy token mới rồi `io(...)` lại — không cần join lại vì auto-join theo
  `userId` trong token mới).
- Một user có thể mở nhiều thiết bị/tab cùng lúc → mỗi socket join room riêng của chính
  nó nhưng **cùng room `user:<userId>`**, nên server broadcast 1 lần là mọi thiết bị của
  user đó đều nhận (không phân biệt theo family).

## Server → Client

| Event                       | Payload                                       | Khi nào                                                                                                                                                                                                                                                    |
| --------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notification:new`          | `NotificationPayload` (xem bên dưới)          | Có thông báo mới (đã persist hoặc push-only) gửi cho user này.                                                                                                                                                                                             |
| `notification:unread-count` | `{ familyId: string \| null, count: number }` | Badge chưa đọc thay đổi — sau khi thông báo mới được persist, hoặc sau khi user tự mark-read/mark-all-read (từ thiết bị khác). `familyId` là family liên quan tới thông báo vừa đổi badge (có thể `null` nếu badge tổng, hiện tại luôn kèm family cụ thể). |
| `notification:error`        | `{ message: string }`                         | Lỗi xác thực khi connect (thường kèm ngắt kết nối ngay sau đó).                                                                                                                                                                                            |

Không có **Client → Server** event nào trên kênh này (không cần ack, không có join thủ
công) — mọi thao tác (list, mark-read, đăng ký thiết bị) đi qua REST bên dưới.

### `NotificationPayload`

```ts
interface NotificationPayload {
  id: string | null; // null nếu push-only (xem bên dưới)
  familyId: string | null; // null với 1 số notification push-only cá nhân (vd bị xóa khỏi family)
  type: NotificationType; // SOS | GENERAL | ALBUM_TAG | JOIN_REQUEST | MEMBER | TASK | CALENDAR | FINANCE | CHAT
  priority: NotificationPriority; // LOW | NORMAL | HIGH | CRITICAL
  title: string;
  body: string;
  referenceType: string | null; // xem bảng điều hướng bên dưới
  referenceId: string | null;
  createdAt: string; // ISO 8601
}
```

**`id` nullable — ý nghĩa "push-only":**

- **`id` có giá trị** → thông báo đã **persist** vào bảng `notifications` của family đó.
  FE có thể coi đây là 1 item trong danh sách (`GET .../notifications`), mark-read qua
  `PATCH .../notifications/:notificationId/read`, và nó góp vào `unread-count`.
- **`id` là `null`** → thông báo **push-only** (không lưu DB, không có trong danh sách,
  không tính vào unread-count) — chỉ đẩy ngay lúc đó cho thiết bị đang mở. Hiện có 2
  trường hợp dùng kiểu này:
  - `CHAT` — tin nhắn chat mới (mỗi tin nhắn không tạo 1 row `notifications` riêng;
    conversation tự có unread-count/list của nó ở module `chats`). ⚠️ Kênh FCM cho `CHAT`
    đẩy nguyên `body` là **nội dung tin nhắn đầy đủ** — banner/lock-screen của thiết bị sẽ
    hiển thị nguyên văn tin nhắn, cân nhắc khi có yêu cầu ẩn nội dung nhạy cảm ở lock-screen.
  - Bị từ chối join request, hoặc bị xóa khỏi family — user đó không còn (hoặc chưa từng
    có) membership để đọc thông báo persist trong family đó.

  → FE nhận `notification:new` với `id: null` thì **chỉ hiển thị toast/banner tức thời**,
  không thêm vào danh sách thông báo, không tăng badge.

## REST bổ trợ (đã có)

Tất cả nằm dưới workspace family (`:familyId` = family liên quan tới thông báo), trừ
đăng ký thiết bị (theo user, không theo family):

- `GET    /api/v1/families/:familyId/notifications` — danh sách thông báo của **thành
  viên hiện tại** trong family này, mới nhất trước. Query `?unreadOnly=true` để chỉ lấy
  chưa đọc.
- `GET    /api/v1/families/:familyId/notifications/unread-count` — `{ count }` số thông
  báo chưa đọc của thành viên hiện tại trong family này.
- `PATCH  /api/v1/families/:familyId/notifications/:notificationId/read` — đánh dấu 1
  thông báo đã đọc (chỉ chủ thông báo).
- `PATCH  /api/v1/families/:familyId/notifications/read-all` — đánh dấu tất cả thông báo
  của thành viên hiện tại (trong family này) là đã đọc.

Đăng ký nhận push khi app ở background (FCM), không phụ thuộc family:

- `POST   /api/v1/devices/tokens` — đăng ký FCM token của thiết bị hiện tại
  (`{ token, platform: ANDROID|IOS|WEB, deviceName? }`). Upsert theo `token` — cùng máy
  đổi tài khoản thì token chuyển sang chủ mới. Gọi lúc app khởi động / sau khi có
  permission notification.
- `DELETE /api/v1/devices/tokens/:token` — hủy đăng ký (gọi lúc logout, tránh nhận push
  nhầm tài khoản trên máy dùng chung).

> Thử nhanh bằng `server/scripts/notifications-ws-test.mjs` — `node
scripts/notifications-ws-test.mjs <email> <password>`.

## Bảng `NotificationType` → điều hướng theo `referenceType`/`referenceId`

FE dùng `type` để chọn icon/nhóm hiển thị, và `referenceType` + `referenceId` để biết
bấm vào thông báo thì mở màn nào:

| `type`         | `referenceType`            | `referenceId` trỏ tới         | Màn điều hướng gợi ý                                                                                                                            |
| -------------- | -------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `SOS`          | `SOS_ALERT`                | `SosAlert.id`                 | Màn theo dõi SOS alert (map tracking) trong family.                                                                                             |
| `ALBUM_TAG`    | `ALBUM_MEDIA`              | id nội dung album (ảnh/video) | Chi tiết nội dung album đã được gắn thẻ.                                                                                                        |
| `JOIN_REQUEST` | `JOIN_REQUEST`             | `JoinRequest.id`              | Màn danh sách yêu cầu tham gia đang chờ duyệt (manager/deputy nhận khi có request mới; người yêu cầu nhận push-only khi bị từ chối, `id` null). |
| `JOIN_REQUEST` | `FAMILY`                   | `Family.id`                   | Người vừa được duyệt vào family nhận thông báo **persisted** (có `id`, hiện trong danh sách + badge) — điều hướng vào màn chính của family mới. |
| `MEMBER`       | `FAMILY_MEMBER`            | `FamilyMember.id`             | Chi tiết thành viên trong family (khi có thành viên mới, hoặc thành viên bị xóa — noti cho manager/deputy còn lại).                             |
| `MEMBER`       | `FAMILY` (push-only)       | `Family.id`                   | Không còn xem được family — user vừa bị xóa khỏi family nhận thông báo này (`id` null vì đã mất membership).                                    |
| `TASK`         | `TASK_ASSIGNMENT`          | `TaskAssignment.id`           | Chi tiết công việc được giao/nhắc hạn/được nghiệm thu.                                                                                          |
| `CALENDAR`     | `CALENDAR_EVENT`           | `CalendarEvent.id`            | Chi tiết sự kiện lịch (nhắc trước giờ bắt đầu).                                                                                                 |
| `FINANCE`      | `BUDGET_ALERT`             | `BudgetAlert.id`              | Chi tiết cảnh báo ngân sách (vượt hạn mức chi tiêu).                                                                                            |
| `FINANCE`      | `FINANCIAL_GOAL`           | `FinancialGoal.id`            | Chi tiết mục tiêu tài chính (đã đạt mục tiêu, hoặc còn thiếu đóng góp theo kỳ).                                                                 |
| `FINANCE`      | `SUPPORT_REQUEST`          | `SpendingSupportRequest.id`   | Chi tiết yêu cầu hỗ trợ chi tiêu (member tạo request, hoặc manager/deputy duyệt/từ chối).                                                       |
| `CHAT`         | `CONVERSATION` (push-only) | `Conversation.id`             | Mở conversation tương ứng (tin nhắn mới) — không có `id` thông báo vì không persist.                                                            |
| `GENERAL`      | `null`                     | —                             | Thông báo chung, không có màn đích cụ thể (hiện chưa có call site production, dùng trong test).                                                 |

> Quy ước chung: nếu `referenceType`/`referenceId` là `null`, FE hiển thị thông báo mà
> không có hành động điều hướng (chỉ đóng/dismiss). Nếu app chưa hỗ trợ 1 `referenceType`
> nào đó (bản build cũ hơn backend), fallback về màn danh sách thông báo mặc định thay vì
> crash.
