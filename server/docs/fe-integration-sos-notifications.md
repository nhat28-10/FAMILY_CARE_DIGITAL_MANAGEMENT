# Hướng dẫn tích hợp FE — SOS & Notifications

> Dành cho team FE (mobile/web). Tài liệu mô tả **hợp đồng thực tế** của backend hiện tại:
> REST + 2 kênh Socket.IO (`/sos`, `/notifications`) + push FCM. Đọc kèm Swagger tại
> `http://localhost:3000/api/docs` để xem schema chi tiết từng DTO.

---

## 1. Chuẩn chung (áp dụng cho mọi API)

- **Base URL**: mọi route REST có prefix `/api/v1` — vd `POST /api/v1/auth/login`.
- **Auth**: header `Authorization: Bearer <accessToken>`. Access token sống **15 phút**,
  refresh token **7 ngày** (rotate mỗi lần refresh). Gặp `401` giữa chừng → gọi refresh
  rồi retry, đó là hành vi bình thường.
- **Response envelope** (mọi endpoint):

```jsonc
// Thành công
{ "success": true, "message": "Đã kích hoạt cảnh báo SOS", "data": { /* payload */ } }
// Lỗi
{ "success": false, "message": "Không tìm thấy cảnh báo SOS", "statusCode": 404 }
```

  → FE luôn đọc payload ở `data`, hiển thị `message` (đã là tiếng Việt sẵn).
- **Workspace-scoped**: SOS và notifications đều nằm dưới family:
  `families/:familyId/...`. User phải là thành viên family đó (server tự kiểm tra,
  không phải thành viên → `403`).
- **Socket.IO**: cả 2 namespace xác thực **lúc handshake** bằng access token:

```js
import { io } from 'socket.io-client';
const socket = io(`${BASE_URL}/sos`, { auth: { token: accessToken } });
// hoặc gửi header: Authorization: Bearer <accessToken>
```

  Token hết hạn/không hợp lệ → server emit `sos:error` / `notification:error` rồi
  **disconnect**. FE bắt `disconnect`/`connect_error`, refresh token, tạo kết nối mới.

---

## 2. Notifications (chuông thông báo + badge)

### 2.1 Kiến trúc 3 kênh

| Kênh | Khi nào FE nhận | FE cần làm gì |
|---|---|---|
| WS `/notifications` | App đang mở (foreground) | Nghe `notification:new` → toast + cập nhật list/badge |
| FCM push | App background / bị kill | Đăng ký device token (mục 2.4), OS hiển thị banner |
| REST | Mở màn danh sách thông báo | Fetch list + unread-count, mark read |

### 2.2 REST endpoints

Tất cả cần `Bearer` token; `:familyId` là family đang xem.

| Method & Path | Mô tả |
|---|---|
| `GET /api/v1/families/:familyId/notifications` | Danh sách thông báo của **thành viên hiện tại**, mới nhất trước. Query `?unreadOnly=true` để chỉ lấy chưa đọc. |
| `GET /api/v1/families/:familyId/notifications/unread-count` | `{ count }` — số chưa đọc, dùng cho badge. |
| `PATCH /api/v1/families/:familyId/notifications/:notificationId/read` | Đánh dấu 1 thông báo đã đọc (chỉ chủ thông báo). |
| `PATCH /api/v1/families/:familyId/notifications/read-all` | Đánh dấu tất cả đã đọc trong family này. |

### 2.3 WebSocket namespace `/notifications`

- Connect thành công → server **tự join** room theo user — **không có** message join
  thủ công, **không có** event client→server nào trên kênh này.
- Một user mở nhiều thiết bị/tab → tất cả cùng nhận (server broadcast theo user).

**Server → Client:**

| Event | Payload | Khi nào |
|---|---|---|
| `notification:new` | `NotificationPayload` (dưới) | Có thông báo mới cho user này |
| `notification:unread-count` | `{ familyId: string \| null, count: number }` | Badge thay đổi (thông báo mới, hoặc mark-read từ thiết bị khác) |
| `notification:error` | `{ message: string }` | Lỗi xác thực khi connect (kèm disconnect) |

```ts
interface NotificationPayload {
  id: string | null;         // null = push-only (xem dưới)
  familyId: string | null;
  type: 'SOS' | 'GENERAL' | 'ALBUM_TAG' | 'JOIN_REQUEST' | 'MEMBER'
      | 'TASK' | 'CALENDAR' | 'FINANCE' | 'CHAT';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  title: string;
  body: string;
  referenceType: string | null;  // bảng điều hướng ở 2.5
  referenceId: string | null;
  createdAt: string;             // ISO 8601
}
```

**Quy tắc `id` nullable (quan trọng):**

- `id` có giá trị → thông báo **đã lưu DB**: hiện trong list REST, tính vào badge,
  mark-read được.
- `id === null` → **push-only** (chat, bị từ chối join, bị xóa khỏi family):
  **chỉ hiển thị toast/banner tức thời** — KHÔNG thêm vào danh sách, KHÔNG tăng badge.

### 2.4 Đăng ký FCM token (push khi app background)

Theo **user**, không theo family:

| Method & Path | Body / Ghi chú |
|---|---|
| `POST /api/v1/devices/tokens` | `{ token, platform: 'ANDROID' \| 'IOS' \| 'WEB', deviceName? }`. Upsert theo `token` — đổi tài khoản trên cùng máy thì token tự chuyển chủ. Gọi lúc app khởi động / sau khi được cấp quyền notification. |
| `DELETE /api/v1/devices/tokens/:token` | Gọi lúc **logout** để không nhận push nhầm tài khoản. |

### 2.5 Điều hướng khi bấm thông báo

Dùng `type` để chọn icon/nhóm, `referenceType` + `referenceId` để mở màn đích:

| `type` | `referenceType` | `referenceId` trỏ tới | Màn gợi ý |
|---|---|---|---|
| `SOS` | `SOS_ALERT` | `SosAlert.id` | Màn theo dõi SOS (map tracking) |
| `ALBUM_TAG` | `ALBUM_MEDIA` | id ảnh/video | Chi tiết nội dung album |
| `JOIN_REQUEST` | `JOIN_REQUEST` | `JoinRequest.id` | Danh sách yêu cầu chờ duyệt |
| `JOIN_REQUEST` | `FAMILY` | `Family.id` | Vừa được duyệt vào family → màn chính family |
| `MEMBER` | `FAMILY_MEMBER` | `FamilyMember.id` | Chi tiết thành viên |
| `MEMBER` | `FAMILY` (push-only) | `Family.id` | Bị xóa khỏi family (`id` null) |
| `TASK` | `TASK_ASSIGNMENT` | `TaskAssignment.id` | Chi tiết công việc |
| `CALENDAR` | `CALENDAR_EVENT` | `CalendarEvent.id` | Chi tiết sự kiện lịch |
| `FINANCE` | `BUDGET_ALERT` | `BudgetAlert.id` | Chi tiết cảnh báo ngân sách |
| `FINANCE` | `FINANCIAL_GOAL` | `FinancialGoal.id` | Chi tiết mục tiêu tài chính |
| `CHAT` | `CONVERSATION` (push-only) | `Conversation.id` | Mở conversation |
| `GENERAL` | `null` | — | Không điều hướng, chỉ dismiss |

> Fallback: `referenceType` lạ (build FE cũ hơn backend) → mở màn danh sách thông báo,
> đừng crash.

---

## 3. SOS (nút khẩn cấp + live tracking)

### 3.1 Luồng nghiệp vụ tổng quát

```
Người gặp nạn (trigger)                    Người thân (watcher)
────────────────────────                   ────────────────────────
1. POST .../sos/alerts  ──────────────►    Nhận noti SOS (WS + FCM, priority CRITICAL)
2. Nhận WS `sos:track:start`               Mở màn map, connect WS /sos
   → bắt đầu stream GPS mỗi 5s             emit `sos:join { workspaceId }`
3. Stream vị trí:                          ◄── nhận `sos:snapshot` (alert + vị trí cuối)
   - WS `sos:location:push` (ưu tiên)      ◄── nhận `sos:location` realtime → vẽ map
   - REST đơn lẻ / batch (offline flush)   Gửi phản hồi: POST .../responses
4. Tự xác nhận an toàn:                    ◄── nhận `sos:response`
   POST .../confirm-safety                 Manager/Deputy đóng alert:
5. Nhận `sos:track:stop`                   PATCH .../resolve hoặc .../cancel
   → dừng stream GPS                       ◄── nhận `sos:resolved`
```

Lưu ý nghiệp vụ:

- **Idempotent**: bấm SOS lặp (hoảng loạn) khi đã có alert ACTIVE của chính mình →
  server trả về alert cũ, không tạo mới, không spam noti; chỉ nhắc lại `sos:track:start`.
- Mỗi family chỉ theo dõi **1 alert ACTIVE mới nhất** trên kênh snapshot.
- Ai nhận noti khi trigger phụ thuộc SOS settings của family (`notifyAllMembers` tắt →
  chỉ FAMILY_MANAGER + DEPUTY_MEMBER).
- Family tắt SOS (`isEnabled: false`) → trigger trả `400` "Tính năng SOS của gia đình đang bị tắt".

### 3.2 REST endpoints (prefix `families/:familyId/sos`)

| Method & Path | Quyền | Mô tả |
|---|---|---|
| `POST .../alerts` | Mọi thành viên | Kích hoạt SOS. Body (đều optional): `{ sourceType?, severity?, initialLatitude?, initialLongitude?, message? }` |
| `GET .../alerts` | Mọi thành viên | Lịch sử alert. Query `?status=ACTIVE\|RESOLVED\|CANCELED\|FALSE_ALARM`. Mỗi item kèm `triggeredByMember`, `resolvedByMember`, `_count.responses`, `_count.locationPoints` |
| `GET .../alerts/:alertId` | Mọi thành viên | Chi tiết alert kèm toàn bộ `responses` + `locationPoints` (vẽ lại lộ trình lịch sử) |
| `POST .../alerts/:alertId/locations` | **Chỉ người kích hoạt** | Gửi 1 điểm GPS. Body: `{ latitude, longitude, sourceType, accuracy?, recordedAt?, deviceId? }` |
| `POST .../alerts/:alertId/locations/batch` | **Chỉ người kích hoạt** | Gửi 1–100 điểm buffer khi offline: `{ points: [ ...như trên ] }` |
| `GET .../alerts/:alertId/location/current` | Mọi thành viên | Vị trí mới nhất (cho watcher vào muộn, khi không dùng WS) |
| `POST .../alerts/:alertId/responses` | Mọi thành viên | Phản hồi: `{ responseType: 'VIEWED' \| 'ON_THE_WAY' \| 'CONFIRM_SAFE' \| 'NEED_HELP', message? }` |
| `POST .../alerts/:alertId/confirm-safety` | Người kích hoạt | Tự xác nhận an toàn (tạo response `CONFIRM_SAFE`) |
| `PATCH .../alerts/:alertId/resolve` | MANAGER / DEPUTY | Đóng alert: `{ resolutionNote?, isFalseAlarm? }` — `isFalseAlarm: true` → status `FALSE_ALARM` thay vì `RESOLVED` |
| `PATCH .../alerts/:alertId/cancel` | MANAGER / DEPUTY | Hủy alert: `{ resolutionNote? }` → status `CANCELED` |

**Enum tham chiếu:**

| Enum | Giá trị |
|---|---|
| `SosSourceType` | `MOBILE_APP` (default), `WEARABLE`, `SIMULATED_DEVICE` |
| `SosSeverity` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `SosAlertStatus` | `ACTIVE`, `RESOLVED`, `CANCELED`, `FALSE_ALARM` |
| `SosResponseType` (member gửi được) | `VIEWED`, `ON_THE_WAY`, `CONFIRM_SAFE`, `NEED_HELP` |
| `GpsSourceType` | `MOBILE_GPS`, `WEARABLE_GPS`, `SIMULATED_GPS` |

### 3.3 WebSocket namespace `/sos`

Khác `/notifications`: sau khi connect phải **join thủ công theo workspace** (family).

**Client → Server** (tất cả có ack — dùng callback của socket.io để đọc kết quả):

| Event | Payload gửi | Ack trả về |
|---|---|---|
| `sos:join` | `{ workspaceId }` | `{ joined: boolean, workspaceId?, error? }` — join xong nếu family đang có alert ACTIVE sẽ nhận ngay `sos:snapshot` |
| `sos:leave` | `{ workspaceId }` | `{ left: true, workspaceId }` |
| `sos:location:push` | `{ workspaceId, alertId, latitude, longitude, accuracy?, sourceType?, recordedAt?, deviceId? }` | `{ ok: boolean, error? }` — kênh stream GPS **độ trễ thấp** cho người kích hoạt (thay REST khi online) |

**Server → Client:**

| Event | Payload | Ý nghĩa |
|---|---|---|
| `sos:snapshot` | `{ alert, lastLocation }` | Trạng thái hiện tại ngay khi join (alert ACTIVE + điểm cuối, có thể `lastLocation: null`) — vẽ map không cần đợi điểm mới |
| `sos:new` | alert đầy đủ (kèm `triggeredByMember`, `responses`, `locationPoints`) | Có alert mới trong family |
| `sos:location` | `{ sosAlertId, point }` | Điểm GPS mới → cập nhật marker trên map |
| `sos:response` | `{ sosAlertId, response }` | Có thành viên phản hồi (kèm `responderMember`) |
| `sos:resolved` | `{ sosAlertId, status, resolvedBy, resolutionNote }` | Alert đã đóng (resolve/cancel/false-alarm) → khóa màn tracking |
| `sos:track:start` | `{ alertId, workspaceId, intervalSec }` | **Chỉ gửi cho thiết bị người kích hoạt**: bắt đầu stream GPS, chu kỳ gợi ý `intervalSec` (hiện = 5s) |
| `sos:track:stop` | `{ alertId }` | **Chỉ người kích hoạt**: alert đã đóng, dừng stream GPS |
| `sos:kicked` | `{ workspaceId }` | Bạn vừa bị xóa khỏi family → rời màn SOS của family đó |
| `sos:error` | `{ message }` | Lỗi xác thực / join sai workspace |

> ⚠️ Payload WS SOS dùng key `sosAlertId` (tham chiếu ngữ cảnh), còn bản thân alert/point
> trong REST và trong payload đều dùng `id` làm PK — đây là quy ước chung toàn backend.

### 3.4 Ví dụ client (watcher — màn theo dõi map)

```js
import { io } from 'socket.io-client';

const socket = io(`${BASE_URL}/sos`, { auth: { token: accessToken } });

socket.on('connect', () => {
  socket.emit('sos:join', { workspaceId: familyId }, (ack) => {
    if (!ack.joined) console.warn('Join thất bại:', ack.error);
  });
});

socket.on('sos:snapshot', ({ alert, lastLocation }) => renderMap(alert, lastLocation));
socket.on('sos:new',      (alert) => showAlertBanner(alert));
socket.on('sos:location', ({ sosAlertId, point }) => moveMarker(sosAlertId, point));
socket.on('sos:response', ({ sosAlertId, response }) => appendResponse(response));
socket.on('sos:resolved', ({ sosAlertId, status }) => closeTracking(sosAlertId, status));

// Token 15' hết hạn → server disconnect: refresh token rồi connect + join lại
socket.on('disconnect', async () => {
  const newToken = await refreshAccessToken();
  socket.auth = { token: newToken };
  socket.connect(); // nhớ emit lại sos:join sau connect
});
```

### 3.5 Ví dụ client (trigger — thiết bị người gặp nạn)

```js
// 1. Kích hoạt
const { data: alert } = await api.post(`/families/${familyId}/sos/alerts`, {
  initialLatitude: lat, initialLongitude: lng, message: 'Tôi cần giúp đỡ',
});

// 2. Server bảo bắt đầu stream (nhận qua WS /sos, kể cả khi bấm lặp)
socket.on('sos:track:start', ({ alertId, workspaceId, intervalSec }) => {
  trackTimer = setInterval(async () => {
    const pos = await getCurrentPosition();
    socket.emit('sos:location:push', {
      workspaceId, alertId,
      latitude: pos.lat, longitude: pos.lng, accuracy: pos.accuracy,
      sourceType: 'MOBILE_GPS', recordedAt: new Date().toISOString(),
    }, (ack) => { if (!ack.ok) bufferPoint(pos); }); // lỗi → buffer, flush qua REST batch
  }, intervalSec * 1000);
});

// 3. Mất mạng → buffer điểm, có mạng lại flush 1 lần (tối đa 100 điểm/lần)
await api.post(`/families/${familyId}/sos/alerts/${alertId}/locations/batch`, {
  points: bufferedPoints,
});

// 4. Alert đóng → dừng GPS
socket.on('sos:track:stop', () => clearInterval(trackTimer));
```

### 3.6 API phụ trợ SOS (settings / liên hệ khẩn cấp / wearable)

| Method & Path | Mô tả |
|---|---|
| `GET \| PATCH /api/v1/families/:familyId/sos/settings` | Xem/sửa cấu hình SOS của family (bật/tắt, notifyAllMembers...) |
| `GET \| POST /api/v1/families/:familyId/sos/emergency-contacts` · `PATCH \| DELETE .../:contactId` | CRUD danh bạ khẩn cấp |
| `GET \| POST /api/v1/families/:familyId/wearables` · `PATCH \| DELETE .../:deviceId` | CRUD thiết bị đeo (SMARTWATCH / GPS_TRACKER / BLE_DEVICE) |
| `POST /api/v1/families/:familyId/wearables/:deviceId/events` · `GET .../events` | Đẩy/xem sensor event từ wearable (`SOS_BUTTON_PRESSED`, `FALL_DETECTED`, `HARD_IMPACT`, `ABNORMAL_MOVEMENT`) — có thể tự trigger SOS alert |

---

## 4. Checklist tích hợp cho FE

**Notifications:**
- [ ] Connect WS `/notifications` sau login, xử lý `notification:new` (toast) +
      `notification:unread-count` (badge).
- [ ] Phân biệt `id === null` (push-only): chỉ toast, không thêm list/badge.
- [ ] Màn danh sách: `GET .../notifications` + mark read / read-all.
- [ ] Đăng ký FCM token sau khi có quyền notification; xóa token khi logout.
- [ ] Router điều hướng theo bảng `referenceType` (mục 2.5) + fallback an toàn.

**SOS:**
- [ ] Nút SOS gọi `POST .../alerts` (kèm vị trí ban đầu nếu có) — chấp nhận bấm lặp.
- [ ] Nghe `sos:track:start`/`sos:track:stop` để bật/tắt stream GPS đúng chu kỳ `intervalSec`.
- [ ] Stream qua WS `sos:location:push`; offline → buffer rồi flush REST batch.
- [ ] Màn theo dõi: join room qua `sos:join`, render từ `sos:snapshot`, cập nhật theo
      `sos:location` / `sos:response` / `sos:resolved`.
- [ ] Nút phản hồi (VIEWED / ON_THE_WAY / CONFIRM_SAFE / NEED_HELP) + nút "Tôi an toàn"
      (confirm-safety) cho người kích hoạt.
- [ ] Manager/Deputy: nút resolve (kèm cờ báo động giả) / cancel.
- [ ] Xử lý `sos:kicked` (rời family) và reconnect + re-join khi token hết hạn.

**Chung:**
- [ ] Interceptor đọc envelope `{ success, message, data }`; 401 → refresh + retry.
- [ ] Khi reconnect WS: `/notifications` chỉ cần connect lại (auto-join);
      `/sos` phải emit lại `sos:join`.
