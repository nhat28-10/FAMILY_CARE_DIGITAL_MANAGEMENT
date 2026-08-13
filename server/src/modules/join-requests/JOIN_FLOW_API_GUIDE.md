# Hướng dẫn tích hợp Mã mời gia đình + Yêu cầu tham gia (dành cho FE)

Tài liệu này mô tả **toàn bộ luồng "vào gia đình bằng mã mời"** kiểu Zalo, thay thế
hoàn toàn luồng `invitations` (email + token) cũ. Gồm 2 nhóm route REST:

- **Mã mời** — nằm trong module `families` (`GET/POST /families/:familyId/invite-code...`).
- **Yêu cầu tham gia (join request)** — module `join-requests` (7 route bên dưới).

Docs tương tác: **Swagger UI `http://<host>:3000/api/docs`** (tag **Families** cho
2 route mã mời, tag **Join Requests** cho 7 route còn lại).

> ⚠️ **Chưa có realtime cho luồng này** (module `notifications` còn stub). FE phải
> **poll `GET /me/join-requests`** để biết yêu cầu đã được duyệt/từ chối chưa
> (xem mục 5). Khi module `notifications` build xong sẽ bổ sung push/socket.

---

## 1. Chuẩn bị chung

### 1.1 Base URL & envelope

- Mọi REST route có prefix **`/api/v1`**.
- Response **thành công** luôn bọc:
  ```json
  { "success": true, "message": "Gửi yêu cầu tham gia thành công", "data": { ... } }
  ```
- Response **lỗi**:
  ```json
  { "success": false, "message": "Mã mời không tồn tại", "statusCode": 404 }
  ```
- Response **lỗi validation** (DTO sai định dạng, vd `message` > 500 ký tự) cũng theo
  format lỗi ở trên, `statusCode: 400`, message đã được dịch sang tiếng Việt.

### 1.2 Xác thực

1. `POST /api/v1/auth/login` → nhận `accessToken` (**hết hạn 15 phút**) + `refreshToken`
   (7 ngày).
2. Mọi request (trừ 1 route preview mã — xem bảng dưới) gắn header:
   `Authorization: Bearer <accessToken>`.
3. Access token hết hạn → `POST /api/v1/auth/refresh` lấy token mới.

### 1.3 Bảng phân quyền

| Hành động | Route | Ai được làm |
|---|---|---|
| Xem mã mời hiện tại | `GET /families/:familyId/invite-code` | Mọi thành viên **ACTIVE** của family |
| Tạo/đổi mã mời | `POST /families/:familyId/invite-code/regenerate` | **`FAMILY_MANAGER`** + tài khoản đã **VERIFIED** |
| Xem trước family qua mã | `GET /invite-codes/:code` | **Public** — không cần đăng nhập |
| Gửi yêu cầu tham gia | `POST /invite-codes/:code/join-requests` | User **đã đăng nhập** — **KHÔNG cần VERIFIED** |
| Xem yêu cầu của tôi | `GET /me/join-requests` | User đã đăng nhập (chỉ thấy yêu cầu của chính mình) |
| Hủy yêu cầu của tôi | `POST /me/join-requests/:id/cancel` | User đã đăng nhập, chỉ chủ yêu cầu |
| Danh sách yêu cầu của family | `GET /families/:familyId/join-requests` | **`FAMILY_MANAGER`** |
| Duyệt yêu cầu | `POST /families/:familyId/join-requests/:id/approve` | **`FAMILY_MANAGER`** + tài khoản đã **VERIFIED** |
| Từ chối yêu cầu | `POST /families/:familyId/join-requests/:id/reject` | **`FAMILY_MANAGER`** (không yêu cầu VERIFIED) |

Ghi chú:
- "VERIFIED" = `VerifiedGuard` — tài khoản phải xác thực email trước
  (`POST /auth/verify-email`), nếu chưa → 403
  `"Vui lòng xác thực tài khoản để dùng chức năng này"`.
- Gọi route có `:familyId` mà không phải thành viên ACTIVE → 403
  `"Bạn không phải thành viên của gia đình này"`.
- Người xin vào **không cần VERIFIED** để gửi/hủy yêu cầu — chỉ cần đăng nhập
  (đăng ký email nào cũng được).

---

## 2. Cơ chế mã mời

- **8 ký tự**, alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 ký tự, bỏ
  `I/O/0/1` để tránh đọc/gõ nhầm khi chia sẻ miệng), sinh crypto-safe
  (`randomBytes`, không dùng `Math.random`).
- **Không phân biệt hoa/thường** — server tự `trim()` + `toUpperCase()` mã
  client gửi lên trước khi tra cứu. FE có thể hiện mã dạng chữ hoa cho đẹp
  nhưng không bắt buộc user gõ đúng hoa/thường.
- Mã **thuộc về family, tái sử dụng nhiều lần** (giống Zalo/Discord) — không
  phải mời đích danh từng người, không ràng buộc email người nhận.
- **`null` khi family chưa từng tạo mã** — FE gọi `GET /families/:familyId/invite-code`,
  nếu `data.inviteCode === null` thì hiện nút **"Tạo mã"** (chỉ hiện cho
  `FAMILY_MANAGER`) gọi sang `POST /families/:familyId/invite-code/regenerate`.
- **Đổi mã (regenerate) làm mã cũ vô hiệu ngay lập tức** — cùng 1 endpoint dùng
  cho cả "tạo lần đầu" và "đổi mã", không có endpoint riêng.
- **Rate-limit 10 request/phút** áp dụng cho 2 route **nhận `:code`**:
  `GET /invite-codes/:code` và `POST /invite-codes/:code/join-requests` (chống
  dò mã bằng brute-force). Vượt quá → NestJS Throttler trả 429.
- Bảo mật không nằm ở độ khó đoán của mã (mã lưu **plaintext**, xem lại được
  bất kỳ lúc nào) — lớp bảo vệ thật sự là **bước manager duyệt join request**.

---

## 3. State machine của Join Request

```
                 ┌──────────►  APPROVED   (do manager, tạo FamilyMember)
                 │
   PENDING ──────┼──────────►  REJECTED   (do manager)
                 │
                 └──────────►  CANCELED   (do chính người gửi)
```

- Một chiều, **không quay lại trạng thái trước**.
- Sau khi bị `REJECTED` hoặc `CANCELED`, user vẫn có thể **gửi yêu cầu mới**
  (server chỉ chặn khi đang có 1 request `PENDING` cho cùng family).
- Đã `APPROVED` → user thành `FamilyMember` với `status: ACTIVE`; muốn vào lại
  gia đình đó không cần join request nữa (đã là thành viên).

---

## 4. Endpoint chi tiết

### 4.1 Xem mã mời hiện tại

`GET /api/v1/families/:familyId/invite-code`

```json
// data
{ "inviteCode": "K8ZQ4MPT" }
```
Chưa từng tạo → `{ "inviteCode": null }`.

### 4.2 Tạo/đổi mã mời (MANAGER + VERIFIED)

`POST /api/v1/families/:familyId/invite-code/regenerate` — không cần body.

```json
// data
{ "inviteCode": "9H3RXW2C" }
```
Response message: `"Tạo mã mời thành công"`.

### 4.3 Xem trước family theo mã (public, không cần token)

`GET /api/v1/invite-codes/:code`

```json
// data
{ "family": { "id": "uuid-family", "name": "Gia đình Nguyễn", "avatarUrl": null } }
```
→ FE dùng để hiện "Bạn sắp xin vào gia đình **{name}**" trước khi user bấm gửi
yêu cầu.

### 4.4 Gửi yêu cầu tham gia

`POST /api/v1/invite-codes/:code/join-requests` — cần đăng nhập, KHÔNG cần VERIFIED.

Body:
```json
{ "message": "Con là út của bố" }   // optional, tối đa 500 ký tự
```

Response (`201`):
```json
{
  "success": true,
  "message": "Gửi yêu cầu tham gia thành công",
  "data": {
    "id": "uuid-join-request",
    "familyId": "uuid-family",
    "userId": "uuid-user",
    "status": "PENDING",
    "message": "Con là út của bố",
    "decidedByMemberId": null,
    "decidedAt": null,
    "createdAt": "2026-07-14T08:00:00.000Z",
    "family": { "id": "uuid-family", "name": "Gia đình Nguyễn", "avatarUrl": null }
  }
}
```

### 4.5 Danh sách yêu cầu của tôi

`GET /api/v1/me/join-requests` — mọi trạng thái, mới nhất trước.

```json
// data (mảng)
[
  {
    "id": "uuid-join-request",
    "status": "PENDING",
    "message": "Con là út của bố",
    "createdAt": "2026-07-14T08:00:00.000Z",
    "family": { "id": "uuid-family", "name": "Gia đình Nguyễn", "avatarUrl": null }
  }
]
```

### 4.6 Hủy yêu cầu của tôi

`POST /api/v1/me/join-requests/:id/cancel` — chỉ khi đang `PENDING`.

Response message: `"Hủy yêu cầu tham gia thành công"`, `data` = join request với
`status: "CANCELED"`.

### 4.7 Danh sách yêu cầu của family (MANAGER)

`GET /api/v1/families/:familyId/join-requests?status=PENDING` — `status` optional
(`PENDING | APPROVED | REJECTED | CANCELED`), bỏ trống = tất cả.

```json
// data (mảng)
[
  {
    "id": "uuid-join-request",
    "status": "PENDING",
    "message": "Con là út của bố",
    "createdAt": "2026-07-14T08:00:00.000Z",
    "user": {
      "id": "uuid-user",
      "email": "con@example.com",
      "fullName": "Nguyễn Văn Út",
      "avatarUrl": null
    }
  }
]
```

### 4.8 Duyệt yêu cầu (MANAGER + VERIFIED)

`POST /api/v1/families/:familyId/join-requests/:id/approve`

Body (tất cả optional — manager chọn vai trò/quan hệ ngay lúc duyệt):
```json
{ "familyRole": "FAMILY_MEMBER", "relationship": "CHILD" }
```
- `familyRole`: `FAMILY_MANAGER | DEPUTY_MEMBER | FAMILY_MEMBER` (default `FAMILY_MEMBER`).
- `relationship`: `FATHER | MOTHER | SPOUSE | CHILD | SISTER | BROTHER | GRANDPARENT | OTHER`
  (default `OTHER`).

Response (`data` = `FamilyMember` vừa tạo/kích hoạt lại):
```json
{
  "success": true,
  "message": "Duyệt yêu cầu tham gia thành công",
  "data": {
    "id": "uuid-family-member",
    "familyId": "uuid-family",
    "userId": "uuid-user",
    "familyRole": "FAMILY_MEMBER",
    "relationship": "CHILD",
    "status": "ACTIVE",
    "joinedAt": "2026-07-14T08:05:00.000Z",
    "leftAt": null
  }
}
```

Lưu ý: nếu family đã đạt số lượng thành viên tối đa của gói subscription hiện
tại → **403** `"Đã đạt số thành viên tối đa của gói hiện tại"` (không duyệt được,
FE nên gợi ý nâng cấp gói hoặc xóa bớt thành viên cũ).

### 4.9 Từ chối yêu cầu (MANAGER)

`POST /api/v1/families/:familyId/join-requests/:id/reject` — không cần VERIFIED,
không body.

Response message: `"Từ chối yêu cầu tham gia thành công"`, `data` = join request
với `status: "REJECTED"`.

---

## 5. Bảng lỗi tiếng Việt (message chính xác 1:1 với service)

| Message | Status | Khi nào |
|---|---|---|
| `Mã mời không tồn tại` | 404 | `GET /invite-codes/:code` hoặc `POST /invite-codes/:code/join-requests` với mã sai/đã đổi |
| `Bạn đã là thành viên của gia đình này` | 409 | Gửi yêu cầu khi đã là `FamilyMember` **ACTIVE** của family đó |
| `Bạn đã gửi yêu cầu tham gia gia đình này rồi` | 409 | Gửi yêu cầu khi đang có 1 request `PENDING` khác cho cùng family |
| `Không tìm thấy yêu cầu tham gia` | 404 | `cancel`/`approve`/`reject` với `:id` không tồn tại (hoặc không thuộc user/family) |
| `Yêu cầu đã được xử lý, không thể hủy` | 400 | `cancel` khi request không còn `PENDING` (đã APPROVED/REJECTED/CANCELED, kể cả bị xử lý ngay trước đó do race) |
| `Chỉ có thể duyệt yêu cầu đang chờ` | 400 | `approve` khi request không còn `PENDING` |
| `Chỉ có thể từ chối yêu cầu đang chờ duyệt` | 400 | `reject` khi request không còn `PENDING` |
| `Đã đạt số thành viên tối đa của gói hiện tại` | **403** | `approve` khi family đã đạt `maxMembers` của gói subscription (⚠️ 403, không phải 400) |
| `Vui lòng xác thực tài khoản để dùng chức năng này` | 403 | Gọi route yêu cầu VERIFIED (regenerate mã, approve) mà tài khoản chưa xác thực email |
| `Bạn không phải thành viên của gia đình này` | 403 | Gọi route có `:familyId` mà không phải thành viên ACTIVE của family đó |
| `Yêu cầu vai trò gia đình: FAMILY_MANAGER` | 403 | Gọi route MANAGER-only (list/approve/reject/regenerate) mà không phải MANAGER |

> ⚠️ **Guard chống race**: `approve`/`reject`/`cancel` đều update có điều kiện
> `status: PENDING` trong Prisma; nếu 2 request đến gần như đồng thời (vd manager
> approve đúng lúc user cancel), request đến sau sẽ nhận đúng message
> "không còn PENDING" ở trên (400) thay vì ghi đè trạng thái đã quyết định — FE
> nên coi lỗi 400 này là "dữ liệu đã đổi, hãy load lại danh sách" chứ không phải
> lỗi nghiêm trọng.

---

## 6. Luồng màn hình FE

### 6.1 Phía FAMILY_MANAGER

1. Màn "Thành viên gia đình" → gọi `GET /families/:familyId/invite-code`.
   - `inviteCode: null` → hiện nút **"Tạo mã mời"**.
   - Có mã → hiện mã to, nút **Copy** + nút **"Đổi mã"** (cả 2 đều gọi
     `POST /families/:familyId/invite-code/regenerate`, chỉ khác label).
2. Tab/màn **"Yêu cầu tham gia"** → `GET /families/:familyId/join-requests?status=PENDING`
   để chỉ hiện các yêu cầu đang chờ (mặc định); có thể thêm filter xem lịch sử
   (bỏ `status` hoặc đổi giá trị).
3. Với mỗi yêu cầu PENDING, manager có 2 nút:
   - **Duyệt** → mở form chọn `familyRole` + `relationship` (mặc định
     `FAMILY_MEMBER`/`OTHER` nếu manager không đổi) → `POST .../approve`.
   - **Từ chối** → `POST .../reject` (không cần form).
4. Sau khi approve/reject thành công, xóa item đó khỏi list PENDING trên UI
   (không cần gọi lại API nếu muốn tối ưu, nhưng an toàn hơn là refetch list).

### 6.2 Phía người xin vào

1. Sau khi đăng ký/đăng nhập (email nào cũng được, **không cần verify** để đi
   tiếp bước này) → màn **"Nhập mã mời"**.
2. User gõ mã 8 ký tự → FE gọi `GET /invite-codes/:code` (không cần token) để
   preview → hiện "Bạn sắp gửi yêu cầu tham gia **{family.name}**".
3. User xác nhận, có thể nhập thêm lời nhắn (optional, ≤ 500 ký tự) →
   `POST /invite-codes/:code/join-requests`.
4. Chuyển sang màn **"Yêu cầu của tôi"** — liệt kê qua `GET /me/join-requests`,
   hiện trạng thái (`PENDING` = "Đang chờ duyệt", `APPROVED` = "Đã được duyệt",
   `REJECTED` = "Đã bị từ chối", `CANCELED` = "Đã hủy").
5. Với yêu cầu `PENDING`, hiện nút **"Hủy yêu cầu"** →
   `POST /me/join-requests/:id/cancel`.
6. **Chưa có push/socket cho sự kiện duyệt** → FE cần **poll**
   `GET /me/join-requests` định kỳ (gợi ý mỗi 10–15s khi màn hình đang mở, hoặc
   khi user pull-to-refresh) để phát hiện khi status đổi từ `PENDING` sang
   `APPROVED`/`REJECTED`. Khi thấy `APPROVED`, gọi `GET /families/my` để family
   mới xuất hiện trong danh sách gia đình của user.

---

## 7. Checklist test nhanh qua Swagger

1. Đăng nhập tài khoản A (manager của 1 family) → Authorize Swagger bằng
   `accessToken` A.
2. `POST /families/{familyId}/invite-code/regenerate` → copy `inviteCode` trả về.
3. Đăng nhập/đăng ký tài khoản B (chưa thuộc family nào) → Authorize bằng
   `accessToken` B (tab Swagger khác hoặc đổi token).
4. `GET /invite-codes/{code}` (không cần token) → xác nhận thấy đúng tên family.
5. `POST /invite-codes/{code}/join-requests` (token B) với body
   `{ "message": "test" }` → `201`, `status: PENDING`.
6. Quay lại token A: `GET /families/{familyId}/join-requests?status=PENDING` →
   thấy request của B.
7. `POST /families/{familyId}/join-requests/{id}/approve` (token A, body rỗng
   hoặc `{ "familyRole": "FAMILY_MEMBER", "relationship": "CHILD" }`) → `200`,
   `data.status: "ACTIVE"`.
8. Quay lại token B: `GET /families/my` → family xuất hiện trong danh sách.
9. (Tùy chọn) Thử lại bước 5 rồi `POST /me/join-requests/{id}/cancel` (token B)
   để test nhánh hủy; hoặc `POST .../reject` (token A) để test nhánh từ chối.
