# Hướng dẫn tích hợp SOS Flow (dành cho FE)

Tài liệu này mô tả **toàn bộ luồng SOS + theo dõi vị trí realtime** cho app FE
(mobile/web). Gồm 2 kênh:

- **REST API** — kích hoạt / xem / phản hồi / đóng cảnh báo. Docs tương tác:
  **Swagger UI `http://<host>:3000/api/docs`** (tag **SOS**).
- **WebSocket (Socket.IO)** — nhận vị trí & sự kiện realtime, namespace **`/sos`**.
  Chi tiết từng event: xem thêm `SOS_REALTIME.md` (cùng thư mục).

> `workspaceId` trong tài liệu này **chính là `familyId`**.

---

## 1. Chuẩn bị chung

### 1.1 Base URL & envelope

- Mọi REST route có prefix **`/api/v1`**.
- Response **thành công** luôn bọc:
  ```json
  { "success": true, "message": "Đã kích hoạt cảnh báo SOS", "data": { ... } }
  ```
- Response **lỗi**:
  ```json
  { "success": false, "message": "Chỉ người kích hoạt SOS mới được gửi vị trí", "statusCode": 403 }
  ```

### 1.2 Xác thực

1. `POST /api/v1/auth/login` → nhận `accessToken` (**hết hạn 15 phút**) + `refreshToken` (7 ngày).
2. Mọi request SOS gắn header: `Authorization: Bearer <accessToken>`.
3. Access token hết hạn → `POST /api/v1/auth/refresh` lấy token mới.
   ⚠️ Phiên SOS có thể kéo dài hơn 15' → FE phải **tự refresh và reconnect socket** (mục 3.4).

### 1.3 Phân quyền trong gia đình

| Hành động | Ai được làm |
|---|---|
| Kích hoạt SOS, xem cảnh báo, phản hồi | Mọi thành viên của family |
| Gửi vị trí (stream GPS) | **Chỉ người đã kích hoạt cảnh báo đó** |
| Xác nhận an toàn (`confirm-safety`) | Chỉ người kích hoạt |
| Resolve / Cancel cảnh báo | `FAMILY_MANAGER` hoặc `DEPUTY_MEMBER` |

Người ngoài family gọi API → 403. Cảnh báo **không tự hết hạn** — chỉ dừng khi
resolve/cancel.

---

## 2. REST Endpoints (base: `/api/v1/families/:familyId/sos`)

### 2.1 Kích hoạt SOS
`POST /alerts` — mọi field đều optional, **trừ khi** cài đặt gia đình bật
`locationRequired` (mặc định **bật**): khi đó kích hoạt từ app (`sourceType`
`MOBILE_APP`) bắt buộc gửi `initialLatitude` + `initialLongitude` (400 nếu thiếu).
Nguồn `WEARABLE`/`SIMULATED_DEVICE` được miễn (thiết bị có thể chưa có GPS fix).
Nếu gia đình tắt SOS (`isEnabled=false`) → 400 `"Tính năng SOS của gia đình đang bị tắt"`.

**Bấm lặp là idempotent**: nếu bạn đang có cảnh báo ACTIVE, `POST /alerts` trả về
**cảnh báo đang có** (không tạo mới, không gửi lại notification cho cả nhà) và
re-emit `sos:track:start` cho thiết bị của bạn → FE cứ dùng `data.id` nhận được,
không cần phân biệt mới/cũ.

```json
{
  "sourceType": "MOBILE_APP",        // MOBILE_APP | WEARABLE | SIMULATED_DEVICE (default MOBILE_APP)
  "severity": "HIGH",                // LOW | MEDIUM | HIGH | CRITICAL
  "initialLatitude": 10.762622,      // [-90, 90]
  "initialLongitude": 106.660172,    // [-180, 180]
  "message": "Tôi cần giúp đỡ khẩn cấp"
}
```

`data` trả về: alert đầy đủ — `id`, `status: "ACTIVE"`, `triggeredByMember`
(kèm `user.fullName/avatarUrl`), `responses[]`, `locationPoints[]`, `triggeredAt`.
→ **FE lưu `id`** để dùng cho các bước sau (mọi resource đều dùng field `id` làm khóa chính).

Side-effect: mọi thành viên khác nhận notification CRITICAL (in-app) + sự kiện
socket `sos:new`; thiết bị người kích hoạt nhận `sos:track:start` (mục 3.3).
Nếu cài đặt `notifyAllMembers=false` → chỉ `FAMILY_MANAGER`/`DEPUTY_MEMBER` nhận notification.

### 2.1b Cài đặt SOS & danh bạ khẩn cấp

- `GET /settings` — cài đặt SOS của gia đình (tự tạo mặc định lần đầu):
  `{ isEnabled, notifyAllMembers, autoCreateAlertFromFall, locationRequired }`.
- `PATCH /settings` — cập nhật (MANAGER/DEPUTY/MEMBER), body là các field trên (optional từng field).
- `GET /emergency-contacts` — danh bạ khẩn cấp (mọi thành viên; sắp theo `priorityOrder`).
- `POST /emergency-contacts` — thêm (MANAGER/DEPUTY): `{ contactName, phoneNumber, relationshipNote?, priorityOrder?, isActive? }`.
- `PATCH /emergency-contacts/:contactId` / `DELETE /emergency-contacts/:contactId` — sửa/xóa (MANAGER/DEPUTY).

### 2.1c Thiết bị đeo & sự kiện cảm biến

Account-level:

- `GET /api/v1/wearables/me` — wearable đang ghép nối của user account hiện tại, hoặc `null` nếu chưa có.
  Dùng endpoint này ở màn Profile/Settings trước khi hiện nút kết nối.

Family-level base: `/api/v1/families/:familyId/wearables`

- `GET /` — danh sách thiết bị của gia đình (kèm `ownerMember`).
- `POST /` — ghép nối thiết bị cho chính mình: `{ deviceName, deviceType, deviceIdentifier, gpsEnabled?, sosEnabled? }`.
  Kèm `ownerMemberId` = ghép hộ thành viên khác (chỉ MANAGER/DEPUTY).
  Ràng buộc: mỗi user account chỉ có **1 wearable đang ghép nối** trên toàn hệ thống (409 nếu trùng);
  `deviceIdentifier` duy nhất trong gia đình.
- `PATCH /:deviceId` — đổi tên/bật tắt GPS-SOS/`pairingStatus` (`UNPAIRED` = gỡ, `LOST` = báo mất) — chủ thiết bị hoặc MANAGER/DEPUTY.
- `DELETE /:deviceId` — xóa thiết bị (chủ hoặc MANAGER/DEPUTY).
- `POST /:deviceId/events` — thiết bị gửi sự kiện cảm biến (**chỉ chủ thiết bị**):
  `{ eventType: SOS_BUTTON_PRESSED|FALL_DETECTED|HARD_IMPACT|ABNORMAL_MOVEMENT, severity?, rawValue?, detectedAt? }`.
  Tự tạo cảnh báo SOS khi: `SOS_BUTTON_PRESSED` (luôn, nếu thiết bị `sosEnabled` + gia đình bật SOS)
  hoặc `FALL_DETECTED` (thêm điều kiện cài đặt `autoCreateAlertFromFall=true`).
  Không tạo trùng khi chủ thiết bị đang có cảnh báo ACTIVE. Response:
  `{ event, alertId, alertCreated }`.
- `GET /:deviceId/events` — 50 sự kiện gần nhất.

### 2.2 Danh sách / chi tiết
- `GET /alerts?status=ACTIVE` — lịch sử cảnh báo (lọc `ACTIVE|RESOLVED|CANCELED|FALSE_ALARM`).
- `GET /alerts/:alertId` — chi tiết 1 cảnh báo, kèm **toàn bộ** `responses` + `locationPoints`
  (tăng dần theo thời gian) → dùng vẽ **lộ trình** đã đi.

### 2.3 Gửi vị trí (chỉ người kích hoạt — người khác bị 403)
`POST /alerts/:alertId/locations` — 1 điểm:

```json
{
  "latitude": 10.762622,             // bắt buộc, [-90, 90]
  "longitude": 106.660172,           // bắt buộc, [-180, 180]
  "accuracy": 12.5,                  // optional, mét
  "sourceType": "MOBILE_GPS",        // bắt buộc: MOBILE_GPS | WEARABLE_GPS | SIMULATED_GPS
  "recordedAt": "2026-07-08T08:00:00Z", // optional, default = now
  "deviceId": "<uuid>"               // optional, phải là thiết bị của chính người gửi
}
```

`POST /alerts/:alertId/locations/batch` — nhiều điểm một lần (mất mạng → buffer → flush):

```json
{ "points": [ { ...như trên... }, { ... } ] }   // 1..100 điểm
```

Điểm nào thiếu `recordedAt` sẽ được server gán timestamp **tăng dần theo thứ tự
mảng** (điểm cuối mảng = mới nhất) — vì vậy hãy gửi points theo đúng thứ tự thời
gian ghi nhận; `latest` trong response và event `sos:location` sẽ là điểm cuối.

Lỗi thường gặp: `403` không phải người kích hoạt / thiết bị không thuộc về bạn;
`400` cảnh báo đã kết thúc.

> 💡 Khi đang online, **ưu tiên gửi qua WebSocket** (`sos:location:push`, mục 3.3) —
> nhanh hơn; endpoint HTTP dùng làm fallback + gửi batch.

### 2.4 Vị trí mới nhất (cho watcher vừa mở màn hình)
`GET /alerts/:alertId/location/current` → điểm gần nhất hoặc `null`.
(Nếu dùng socket thì `sos:snapshot` đã cấp sẵn thông tin này khi join.)

### 2.5 Phản hồi của thành viên
`POST /alerts/:alertId/responses`:

```json
{ "responseType": "NEED_HELP", "message": "Tôi đang trên đường tới" }
// responseType: VIEWED | CONFIRM_SAFE | NEED_HELP
```

### 2.6 Người kích hoạt xác nhận an toàn
`POST /alerts/:alertId/confirm-safety` — không body. Chỉ tạo response CONFIRM_SAFE,
**không đóng** cảnh báo (đóng vẫn cần manager resolve).

### 2.7 Đóng cảnh báo (MANAGER / DEPUTY)
- `PATCH /alerts/:alertId/resolve` — xử lý xong (→ `RESOLVED`, hoặc `FALSE_ALARM` nếu kèm cờ).
- `PATCH /alerts/:alertId/cancel` — hủy (→ `CANCELED`; bỏ qua `isFalseAlarm`).

```json
{
  "resolutionNote": "Đã xác nhận thành viên an toàn",  // optional
  "isFalseAlarm": true                                  // optional — resolve với trạng thái FALSE_ALARM (báo động giả)
}
```

Side-effect: cả room nhận `sos:resolved` (kèm `status` cuối); thiết bị người kích hoạt nhận `sos:track:stop`.

---

## 3. WebSocket realtime (Socket.IO, namespace `/sos`)

### 3.1 Kết nối

```js
import { io } from 'socket.io-client';
const socket = io('http://<host>:3000/sos', { auth: { token: accessToken } });
socket.on('connect', () => {
  socket.emit('sos:join', { workspaceId: familyId }, (ack) => {
    // ack = { joined: true, workspaceId } | { joined: false, error }
  });
});
```

**Quan trọng:** rooms không được khôi phục sau reconnect → luôn `sos:join` lại
trong handler `connect`.

### 3.2 Màn hình theo dõi (watcher) — vẽ map

1. `sos:join` → nếu đang có cảnh báo active, nhận ngay:
   ```
   sos:snapshot  { alert, lastLocation }     // vẽ map + marker ngay lập tức
   ```
2. Nghe liên tục:
   ```
   sos:new       alert                        // có cảnh báo mới → mở màn hình SOS
   sos:location  { sosAlertId, point }        // point = { latitude, longitude, accuracy, recordedAt } → di chuyển marker
   sos:response  { sosAlertId, response }     // hiện phản hồi thành viên
   sos:resolved  { sosAlertId, status, resolvedBy, resolutionNote }  // dừng tracking, đóng map
   ```

### 3.3 Màn hình người kích hoạt (trigger) — stream GPS

1. Kết nối + `sos:join` như trên.
2. Gọi REST `POST /alerts` để kích hoạt.
3. Nhận `sos:track:start { alertId, workspaceId, intervalSec }` → bật GPS, mỗi
   `intervalSec` giây (hiện tại **5s**) emit:
   ```js
   socket.emit('sos:location:push', {
     workspaceId, alertId,
     latitude, longitude,            // bắt buộc
     accuracy,                       // optional
     sourceType: 'MOBILE_GPS',       // optional, default MOBILE_GPS
     recordedAt,                     // optional ISO8601
   }, (ack) => { /* { ok: true } | { ok: false, error } */ });
   ```
4. Nhận `sos:track:stop { alertId }` (hoặc `sos:resolved`) → **dừng gửi GPS**.
5. Mất mạng giữa chừng → buffer điểm lại, khi có mạng gửi bù qua REST
   `POST /alerts/:alertId/locations/batch`.

### 3.4 Token 15' hết hạn giữa phiên

Socket không tự chết khi token hết hạn, nhưng khi `disconnect`/`connect_error`:
refresh token → tạo lại socket với token mới → `sos:join` lại → (watcher sẽ nhận
lại `sos:snapshot` nên không mất trạng thái).

### 3.5 Các event khác

```
sos:kicked  { workspaceId }   // bị xóa khỏi gia đình → thoát màn hình SOS
sos:error   { message }       // lỗi xác thực/tham số (thường kèm disconnect)
```

---

## 3.6 Code mẫu copy-paste cho FE (khuyến nghị dùng WebSocket, KHÔNG polling)

> Cài: `npm install socket.io-client`

### A. File dùng chung — kết nối + tự reconnect

```js
// sos-socket.js
import { io } from 'socket.io-client';

let socket = null;

/**
 * Kết nối tới kênh SOS. getAccessToken() là hàm của app bạn,
 * trả về access token còn hạn (tự refresh nếu cần).
 */
export async function connectSos(getAccessToken, familyId, handlers = {}) {
  const token = await getAccessToken();
  socket = io('http://<host>:3000/sos', { auth: { token } });

  socket.on('connect', () => {
    // Room KHÔNG tự khôi phục sau reconnect → luôn join lại ở đây.
    socket.emit('sos:join', { workspaceId: familyId }, (ack) => {
      if (!ack.joined) console.warn('Join thất bại:', ack.error);
    });
  });

  // Token hết hạn giữa chừng → server ngắt → lấy token mới rồi nối lại.
  socket.on('disconnect', async () => {
    socket.auth = { token: await getAccessToken() };
    socket.connect(); // 'connect' ở trên sẽ tự sos:join lại
  });

  // Đăng ký các sự kiện màn hình quan tâm (truyền vào từ ngoài).
  for (const [event, fn] of Object.entries(handlers)) {
    socket.on(event, fn);
  }
  return socket;
}

export function getSosSocket() {
  return socket;
}
```

### B. Màn hình NGƯỜI THEO DÕI (map) — không gọi lặp API nào cả

```js
// watcher-screen.js
import { connectSos } from './sos-socket';

await connectSos(getAccessToken, familyId, {
  // Vừa vào mà đang có SOS → server tự đưa ngay alert + vị trí cuối.
  'sos:snapshot': ({ alert, lastLocation }) => {
    openSosMap(alert);                             // hiện tên người gặp nạn, lời nhắn
    if (lastLocation) moveMarker(lastLocation);    // đặt marker ngay lập tức
  },
  // Có người vừa bấm SOS → mở màn hình map.
  'sos:new': (alert) => openSosMap(alert),
  // Mỗi lần người gặp nạn gửi GPS → marker tự chạy. KHÔNG cần polling.
  'sos:location': ({ point }) => moveMarker(point), // { latitude, longitude, accuracy, recordedAt }
  // Thành viên khác bấm nút phản hồi.
  'sos:response': ({ response }) => showResponseToast(response),
  // Quản lý đóng cảnh báo → dừng, đóng map.
  'sos:resolved': ({ resolutionNote }) => closeSosMap(resolutionNote),
});
```

Nút phản hồi vẫn gọi REST như cũ: `POST /sos/alerts/{alertId}/responses`.

### C. Màn hình NGƯỜI GẶP NẠN — stream GPS qua socket

```js
// trigger-screen.js
import { connectSos, getSosSocket } from './sos-socket';

let gpsTimer = null;

await connectSos(getAccessToken, familyId, {
  // Server bảo "bắt đầu gửi GPS mỗi intervalSec giây" (sau khi POST /alerts).
  'sos:track:start': ({ alertId, workspaceId, intervalSec }) => {
    gpsTimer = setInterval(async () => {
      const pos = await getCurrentGps(); // hàm lấy GPS của app bạn
      getSosSocket().emit('sos:location:push', {
        workspaceId,
        alertId,
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracy: pos.accuracy,
        sourceType: 'MOBILE_GPS',
      }, (ack) => {
        if (!ack.ok) console.warn('Gửi vị trí lỗi:', ack.error);
      });
    }, intervalSec * 1000);
  },
  // Server bảo dừng (cảnh báo đã đóng).
  'sos:track:stop': () => { clearInterval(gpsTimer); gpsTimer = null; },
  'sos:resolved':   () => { clearInterval(gpsTimer); gpsTimer = null; },
});

// Nút SOS đỏ: vẫn kích hoạt bằng REST — sau đó server tự gửi sos:track:start về.
async function onSosButtonPress() {
  const pos = await getCurrentGps();
  await api.post(`/families/${familyId}/sos/alerts`, {
    initialLatitude: pos.latitude,
    initialLongitude: pos.longitude,
    message: 'Tôi cần giúp đỡ',
  });
  // KHÔNG cần tự bật timer — đợi sự kiện sos:track:start ở trên.
}
```

### D. REST chỉ còn dùng cho các việc "một lần"

| Việc | Cách gọi |
|---|---|
| Bấm nút SOS | `POST /alerts` (REST) |
| Nhận vị trí liên tục | ❌ không polling — nghe `sos:location` (socket) |
| Gửi vị trí liên tục | `sos:location:push` (socket) |
| Gửi bù điểm GPS lúc mất mạng | `POST /alerts/{id}/locations/batch` (REST, 1 lần khi có mạng lại) |
| Phản hồi / xác nhận an toàn / resolve / cancel | REST như mục 2 |
| Xem lịch sử cũ | `GET /alerts`, `GET /alerts/{id}` (REST) |

---

## 4. Kịch bản end-to-end mẫu

```
[User A - điện thoại]                      [Server]                    [User B - watcher]
connect /sos + sos:join ────────────────▶
                                          ◀──────────────── connect /sos + sos:join
POST /alerts ───────────────────────────▶
   ◀── data.id                            ── sos:new ─────────────────▶ (mở map)
   ◀── sos:track:start {intervalSec:5}
(mỗi 5s) sos:location:push ────────────▶  ── sos:location ───────────▶ (marker di chuyển)
                                          ◀───────── POST /responses {NEED_HELP}
   ◀── sos:response                       ── sos:response ───────────▶
                       [Manager] PATCH /alerts/:id/resolve ──────────▶
   ◀── sos:track:stop (dừng GPS)          ── sos:resolved ───────────▶ (đóng map)
```

Watcher vào **giữa chừng**: chỉ cần `sos:join` → nhận `sos:snapshot` → vẽ map ngay.

---

## 5. Test nhanh không cần FE

- Swagger UI: `http://<host>:3000/api/docs` → Authorize bằng accessToken → tag **SOS**.
- Socket: `server/scripts/sos-ws-test.mjs` có sẵn 2 role:
  ```powershell
  # watcher
  $env:TOKEN="<token B>"; $env:WORKSPACE="<familyId>"; node scripts/sos-ws-test.mjs
  # trigger (tự stream khi nhận sos:track:start)
  $env:TOKEN="<token A>"; $env:WORKSPACE="<familyId>"; $env:ROLE="trigger"; node scripts/sos-ws-test.mjs
  ```
---

## 6. Wear OS emulator auto-SOS events

Use the existing wearable event endpoint:

`POST /api/v1/families/:familyId/wearables/:deviceId/events`

Supported demo auto-SOS events:

- `FALL_DETECTED`: create SOS only when family setting `autoCreateAlertFromFall=true`.
- `HEART_RATE_ABNORMAL`: create SOS when family SOS and device SOS are enabled.
- `SOS_BUTTON_PRESSED`: create SOS immediately from the wearable SOS button.

Example fall event:

```json
{
  "eventType": "FALL_DETECTED",
  "severity": "HIGH",
  "rawValue": {
    "gForce": 3.2,
    "stillSeconds": 8
  }
}
```

Example abnormal heart-rate event:

```json
{
  "eventType": "HEART_RATE_ABNORMAL",
  "rawValue": {
    "heartRate": 142,
    "thresholdHigh": 130,
    "durationSeconds": 30
  }
}
```

Response remains:

```json
{
  "event": { "...": "..." },
  "alertId": "<sosAlertId or null>",
  "alertCreated": true
}
```
