# FE Integration — Quản lý vai trò thành viên gia đình

Hướng dẫn tích hợp / mock cho 2 API vai trò thành viên (mô hình Zalo). Dành cho FE
(admin web + mobile).

## Quy ước chung

- **Base URL**: `/api/v1`
- **Auth**: Bearer access token — `Authorization: Bearer <accessToken>`. Người gọi **phải là
  `FAMILY_MANAGER`** của đúng `familyId` đó, nếu không → `403`.
- **Envelope thành công**: `{ "success": true, "message": "...", "data": <payload> }`
- **Envelope lỗi**: `{ "success": false, "message": "...", "statusCode": <number> }`
- **Vai trò** (`familyRole`): `FAMILY_MANAGER` (trưởng nhóm) · `DEPUTY_MEMBER` (phó nhóm) ·
  `FAMILY_MEMBER` (thành viên).
- **Giới hạn phó nhóm**: mặc định **2** (config `FAMILY_MAX_DEPUTIES`).

---

## 1. Đổi vai trò thành viên (bổ nhiệm / gỡ phó nhóm)

Đổi vai trò giữa `DEPUTY_MEMBER` và `FAMILY_MEMBER`. **Không** dùng để đổi trưởng nhóm.

```
PATCH /api/v1/families/:familyId/members/:userId/role
```

- `:familyId` — id gia đình.
- `:userId` — **userId** của thành viên cần đổi (không phải familyMemberId).

### Request body

```json
{ "familyRole": "DEPUTY_MEMBER" }
```

| Field | Kiểu | Ràng buộc |
|-------|------|-----------|
| `familyRole` | string | Bắt buộc. Chỉ nhận `"DEPUTY_MEMBER"` hoặc `"FAMILY_MEMBER"`. Gửi `"FAMILY_MANAGER"` → 400. |

### Response 200 — `data` là member đã cập nhật (kèm `user`)

```json
{
  "success": true,
  "message": "Cập nhật vai trò thành viên thành công",
  "data": {
    "id": "b2c3d4e5-0000-0000-0000-000000000001",
    "familyId": "a1111111-0000-0000-0000-000000000000",
    "userId": "c9999999-0000-0000-0000-000000000000",
    "displayName": null,
    "familyRole": "DEPUTY_MEMBER",
    "relationship": "CHILD",
    "status": "ACTIVE",
    "locationSharingEnabled": false,
    "joinedAt": "2026-07-01T03:12:00.000Z",
    "leftAt": null,
    "createdAt": "2026-07-01T03:12:00.000Z",
    "updatedAt": "2026-07-23T02:13:00.000Z",
    "user": {
      "id": "c9999999-0000-0000-0000-000000000000",
      "email": "child@example.com",
      "fullName": "Bé An",
      "avatarUrl": null,
      "userType": "NORMAL_USER"
    }
  }
}
```

> Gửi lại đúng role hiện tại (no-op) vẫn trả `200` với member hiện tại — **idempotent**, không lỗi.

### Các lỗi

| statusCode | Khi nào | `message` (ví dụ) |
|-----------|---------|-------------------|
| 400 | `familyRole` không thuộc {DEPUTY_MEMBER, FAMILY_MEMBER} | `Vai trò gia đình không hợp lệ` |
| 400 | Nâng phó nhưng đã đủ số phó tối đa | `Đã đạt số phó nhóm tối đa` |
| 400 | Target đang là trưởng nhóm | `Không thể đổi vai trò của quản lý gia đình` |
| 401 | Thiếu/không hợp lệ access token | `Unauthorized` |
| 403 | Người gọi không phải FAMILY_MANAGER | (message quyền) |
| 404 | Không tìm thấy thành viên ACTIVE trong gia đình | `Không tìm thấy thành viên trong gia đình này` |

### Mock (fetch)

```ts
await fetch(`/api/v1/families/${familyId}/members/${userId}/role`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ familyRole: 'DEPUTY_MEMBER' }),
});
```

---

## 2. Trao quyền trưởng nhóm (transfer ownership)

Target lên `FAMILY_MANAGER`, người gọi (trưởng nhóm cũ) tự động tụt xuống `FAMILY_MEMBER`.
Swap **atomic** — luôn đúng 1 trưởng nhóm.

```
POST /api/v1/families/:familyId/transfer-ownership
```

### Request body

```json
{
  "targetUserId": "c9999999-0000-0000-0000-000000000000",
  "confirm": true
}
```

| Field | Kiểu | Ràng buộc |
|-------|------|-----------|
| `targetUserId` | string (UUID) | Bắt buộc. userId của thành viên nhận quyền. |
| `confirm` | boolean | Bắt buộc **= `true`** (bước xác nhận). Gửi `false`/thiếu → 400. |

> FE nên hiện dialog cảnh báo "Bạn sẽ không còn là trưởng nhóm" trước khi gửi `confirm: true`.

### Response 200 — `data` là family đã cập nhật kèm `members[]`

```json
{
  "success": true,
  "message": "Trao quyền trưởng nhóm thành công",
  "data": {
    "id": "a1111111-0000-0000-0000-000000000000",
    "name": "Nhà mình",
    "description": null,
    "avatarUrl": null,
    "createdById": "b0000000-0000-0000-0000-000000000000",
    "inviteCode": "AB12CD34",
    "createdAt": "2026-07-01T03:00:00.000Z",
    "updatedAt": "2026-07-23T02:20:00.000Z",
    "members": [
      {
        "id": "m-new-manager",
        "familyId": "a1111111-0000-0000-0000-000000000000",
        "userId": "c9999999-0000-0000-0000-000000000000",
        "familyRole": "FAMILY_MANAGER",
        "relationship": "CHILD",
        "status": "ACTIVE",
        "joinedAt": "2026-07-01T03:12:00.000Z",
        "user": {
          "id": "c9999999-0000-0000-0000-000000000000",
          "email": "child@example.com",
          "fullName": "Bé An",
          "avatarUrl": null,
          "userType": "NORMAL_USER"
        }
      },
      {
        "id": "m-old-manager",
        "familyId": "a1111111-0000-0000-0000-000000000000",
        "userId": "b0000000-0000-0000-0000-000000000000",
        "familyRole": "FAMILY_MEMBER",
        "relationship": "FATHER",
        "status": "ACTIVE",
        "joinedAt": "2026-07-01T03:00:00.000Z",
        "user": {
          "id": "b0000000-0000-0000-0000-000000000000",
          "email": "dad@example.com",
          "fullName": "Bố",
          "avatarUrl": null,
          "userType": "NORMAL_USER"
        }
      }
    ]
  }
}
```

> `data` chính là payload của `GET /families/:familyId` (member sắp xếp theo `joinedAt` tăng dần,
> mỗi member kèm `user`). FE có thể refresh state gia đình trực tiếp từ response này.

### Các lỗi

| statusCode | Khi nào | `message` (ví dụ) |
|-----------|---------|-------------------|
| 400 | `confirm` không phải `true`, `targetUserId` không phải UUID | (message validation VI) |
| 400 | Trao cho chính mình | `Không thể trao quyền cho chính mình` |
| 401 | Thiếu/không hợp lệ access token | `Unauthorized` |
| 403 | Người gọi không phải FAMILY_MANAGER | (message quyền) |
| 404 | Target không phải thành viên ACTIVE | `Không tìm thấy thành viên trong gia đình này` |

### Mock (fetch)

```ts
await fetch(`/api/v1/families/${familyId}/transfer-ownership`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ targetUserId, confirm: true }),
});
```

---

## Thông báo (notification)

Cả 2 API bắn notification realtime (`type: MEMBER`) tới người liên quan qua kênh
`/notifications` sẵn có (xem `notifications/NOTIFICATIONS_REALTIME.md`):

- Đổi role: người bị đổi nhận "Bạn được bổ nhiệm làm phó nhóm" / "Vai trò của bạn đã thay đổi".
- Trao quyền: trưởng mới nhận "Bạn đã trở thành trưởng nhóm"; trưởng cũ nhận
  "Bạn đã trao quyền trưởng nhóm".

FE không cần gọi thêm gì — chỉ lắng nghe event `notification:new` như các luồng khác.

## Gợi ý UX (theo Zalo)

- Menu thành viên: "Thêm phó nhóm" (khi là FAMILY_MEMBER) / "Gỡ vai trò phó nhóm" (khi là
  DEPUTY_MEMBER) → gọi API 1.
- Nút "Trao quyền trưởng nhóm" tách riêng, có dialog xác nhận → gọi API 2 với `confirm: true`.
- Ẩn/disable các thao tác này nếu user hiện tại không phải trưởng nhóm (API vẫn chặn bằng 403).
- Khi đủ 2 phó, disable nút "Thêm phó nhóm" kèm tooltip "Đã đạt số phó nhóm tối đa".
