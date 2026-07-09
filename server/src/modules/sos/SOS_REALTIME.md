# SOS Realtime — Hợp đồng sự kiện WebSocket (cho FE)

Kênh realtime SOS chạy trên **Socket.IO**, namespace **`/sos`**
(vd `http://localhost:3000/sos`). Dùng cho theo dõi vị trí trực tiếp của người kích hoạt
SOS trong một gia đình ("workspace"). `workspaceId` **chính là `familyId`**.

## Kết nối & xác thực

Gửi access token (JWT 15') khi handshake — giống lớp HTTP:

```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:3000/sos', { auth: { token: accessToken } });
// hoặc header: Authorization: Bearer <accessToken>
```

- Token hết hạn / tài khoản không `ACTIVE` → server phát `sos:error` rồi **ngắt kết nối**.
- Token 15' hết hạn giữa phiên tracking dài → client cần **refresh token và reconnect**
  (khi `connect_error`/`disconnect`, lấy token mới rồi `io(...)` lại và `sos:join` lại).

## Client → Server

| Event | Payload | Ack trả về | Ghi chú |
|---|---|---|---|
| `sos:join` | `{ workspaceId }` | `{ joined, workspaceId?, error? }` | Vào room. Kiểm tra membership. Nếu có cảnh báo đang active → server đẩy ngay `sos:snapshot` cho riêng socket này. |
| `sos:leave` | `{ workspaceId }` | `{ left, workspaceId? }` | Rời room. |
| `sos:location:push` | `{ workspaceId, alertId, latitude, longitude, accuracy?, sourceType?, recordedAt?, deviceId? }` | `{ ok, error? }` | Stream 1 điểm GPS. **Chỉ người kích hoạt cảnh báo** mới được gửi (server enforce). Server lưu DB và broadcast `sos:location` cho cả room. `sourceType` mặc định `MOBILE_GPS`. |

Ràng buộc toạ độ: `latitude ∈ [-90, 90]`, `longitude ∈ [-180, 180]` (số hữu hạn).

## Server → Client

| Event | Payload (rút gọn) | Khi nào |
|---|---|---|
| `sos:new` | `alert` (đầy đủ, kèm `triggeredByMember`, `device`, `responses`, `locationPoints`) | Có cảnh báo SOS mới trong gia đình. |
| `sos:snapshot` | `{ alert, lastLocation }` | Ngay khi `sos:join` mà đang có cảnh báo active. `lastLocation` = điểm mới nhất hoặc `null`. **FE dùng cái này để vẽ map ngay.** |
| `sos:location` | `{ sosAlertId, point }` | Có điểm vị trí mới (từ HTTP hoặc `sos:location:push`). `point` gồm `latitude/longitude/accuracy/recordedAt`. **FE cập nhật marker.** |
| `sos:response` | `{ sosAlertId, response }` | Có thành viên phản hồi (VIEWED / CONFIRM_SAFE / NEED_HELP...). |
| `sos:resolved` | `{ sosAlertId, status, resolvedBy, resolutionNote }` | Cảnh báo được resolve/cancel. **FE dừng tracking, đóng map.** |
| `sos:track:start` | `{ alertId, workspaceId, intervalSec }` | Gửi **riêng cho thiết bị người kích hoạt** ngay sau khi tạo cảnh báo → app bắt đầu stream `sos:location:push` mỗi `intervalSec` giây. |
| `sos:track:stop` | `{ alertId }` | Gửi **riêng cho thiết bị người kích hoạt** khi cảnh báo đóng → app dừng stream. |
| `sos:kicked` | `{ workspaceId }` | Bị loại khỏi gia đình → mất quyền theo dõi room. |
| `sos:error` | `{ message }` | Lỗi xác thực/tham số (thường kèm ngắt kết nối). |

## Luồng "map tracking kiểu Messenger" cho FE

**App người theo dõi (watcher):**
1. `connect` → `sos:join({ workspaceId })`.
2. Nếu nhận `sos:snapshot` → vẽ map với `alert` + `lastLocation`.
3. Nghe `sos:location` liên tục → di chuyển marker.
4. Nhận `sos:resolved` → dừng, đóng map.

**App người kích hoạt (trigger):**
1. `connect` → `sos:join`.
2. Gọi REST `POST /api/v1/families/:familyId/sos/alerts` để tạo cảnh báo.
3. Nhận `sos:track:start` → bắt đầu `sos:location:push` mỗi `intervalSec` giây.
4. Nhận `sos:track:stop` (hoặc `sos:resolved`) → dừng gửi.

> Thử nhanh bằng `server/scripts/sos-ws-test.mjs` (có sẵn 2 role: `watcher` và `trigger`).

## REST bổ trợ (đã có)

- `POST   /api/v1/families/:familyId/sos/alerts` — kích hoạt.
- `POST   /api/v1/families/:familyId/sos/alerts/:alertId/locations` — gửi 1 điểm (HTTP).
- `POST   /api/v1/families/:familyId/sos/alerts/:alertId/locations/batch` — gửi lô điểm (buffer offline).
- `GET    /api/v1/families/:familyId/sos/alerts/:alertId/location/current` — vị trí mới nhất (fallback khi chưa có socket).
- `PATCH  /api/v1/families/:familyId/sos/alerts/:alertId/resolve|cancel` — đóng cảnh báo (MANAGER/DEPUTY).
