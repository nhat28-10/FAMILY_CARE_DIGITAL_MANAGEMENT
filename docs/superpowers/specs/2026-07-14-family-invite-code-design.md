# Thiết kế: Mã mời gia đình kiểu Zalo + Join Request

**Ngày:** 2026-07-14 · **Trạng thái:** Đã duyệt thiết kế, chờ plan
**Thay thế:** luồng invitations cũ (token 64 hex, ràng buộc email, mời từng người)

## Bối cảnh & quyết định

Luồng invitations hiện tại mời đích danh qua email + token 64 hex chỉ trả 1 lần,
nhưng backend không gửi email nên manager phải tự chuyển link dài; token không
hiển thị nổi trên UI; người được mời buộc phải đăng ký đúng email được đoán
trước. Sau khi so với mô hình mời của Zalo/Discord, đã chốt các quyết định:

1. **Mã ngắn thay thế hoàn toàn token** — không còn token 64 hex.
2. **Mã thuộc về family, tái sử dụng** (kiểu Zalo) — không mời từng người,
   không ràng buộc email. Lớp bảo vệ là bước manager duyệt (đã có sẵn).
3. **Manager tạo mã ban đầu** (không tự sinh khi tạo family); sau đó **mọi
   thành viên ACTIVE xem/chia sẻ được mã**; chỉ manager đổi mã.
4. **Mã lưu plaintext, xem lại được** bất kỳ lúc nào.
5. **Gỡ bỏ hoàn toàn module invitations cũ** (bảng + API + admin CRUD) — dự án
   chưa có user thật, không cần giữ tương thích. Báo team trước khi merge vì
   đụng admin module.

## 1. Data model (`schema.prisma`)

### `Family` — thêm cột

```prisma
/// Mã mời ngắn của gia đình (kiểu Zalo). Null = manager chưa tạo mã.
inviteCode String? @unique @map("invite_code")
```

- 8 ký tự, alphabet tránh nhầm lẫn: `A-H J-N P-Z 2-9` (bỏ I, O, 0, 1) — 32 ký
  tự → không gian 32⁸ ≈ 1.1 nghìn tỷ mã.
- Sinh bằng `randomBytes` + map vào alphabet (crypto-safe, không dùng
  `Math.random`). Retry khi trùng unique (xác suất cực thấp).
- Input từ client được normalize **uppercase + trim** trước khi tra.

### Model mới `JoinRequest` (`join_requests`)

```prisma
model JoinRequest {
  id                String            @id @default(uuid())
  familyId          String
  userId            String
  status            JoinRequestStatus @default(PENDING)
  /// Lời nhắn của người xin vào (vd "Con là út của bố").
  message           String?
  /// Thành viên (manager) đã duyệt/từ chối.
  decidedByMemberId String?
  decidedAt         DateTime?
  createdAt         DateTime          @default(now())

  family          Family        @relation(fields: [familyId], references: [id], onDelete: Cascade)
  user            User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  decidedByMember FamilyMember? @relation(fields: [decidedByMemberId], references: [id], onDelete: SetNull)

  @@index([familyId, status])
  @@index([userId])
  @@map("join_requests")
}

enum JoinRequestStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELED
}
```

- Ràng buộc "mỗi user tối đa 1 yêu cầu PENDING/family" kiểm tra ở service
  (Prisma không hỗ trợ partial unique index; mức đồ án chấp nhận check + create
  trong service).

### Gỡ bỏ

- Drop model `Invitation`, enum `InvitationStatus`, các relation
  `CreatedByMember`/`ApprovedByInvitations`/`ClaimedBy` trên
  `Family`/`FamilyMember`/`User`.
- ENV `INVITATION_EXPIRES_IN_DAYS` + config `invitation.expiresInDays` hết tác
  dụng → gỡ khỏi `configuration.ts` và `.env.example`.

### Migration (1 migration duy nhất)

1. `ALTER TABLE families ADD COLUMN invite_code` (nullable, unique) — không cần
   backfill vì thiết kế cho phép null.
2. `CREATE TABLE join_requests` + enum.
3. `DROP TABLE invitations` + enum `InvitationStatus`.

## 2. API endpoints

Mọi route prefix `/api/v1`, envelope + message tiếng Việt theo convention
CLAUDE.md.

### Nhóm mã mời — đặt trong module `families`

| Route | Guard/Quyền | Hành vi |
|---|---|---|
| `GET /families/:familyId/invite-code` | JWT + FamilyPermissionGuard (mọi thành viên ACTIVE) | Trả `{ inviteCode }` — `null` nếu chưa tạo (FE hiện nút "Tạo mã" cho manager) |
| `POST /families/:familyId/invite-code/regenerate` | JWT + FamilyPermissionGuard + `@FamilyRoles(FAMILY_MANAGER)` + VerifiedGuard | Tạo mã lần đầu **hoặc** đổi mã (mã cũ vô hiệu ngay). Trả `{ inviteCode }` |

### Nhóm join request — module mới `join-requests` (thay module `invitations`)

| Route | Guard/Quyền | Hành vi |
|---|---|---|
| `GET /invite-codes/:code` | **Public** + `@Throttle` | Preview cho màn nhập mã: `{ family: { id, name } }`. 404 `"Mã mời không tồn tại"` |
| `POST /invite-codes/:code/join-requests` | JWT (không cần VERIFIED) + `@Throttle` | Body `{ message? }` (≤ 500 ký tự). Tạo request PENDING. 409 nếu đã là thành viên ACTIVE (`"Bạn đã là thành viên của gia đình này"`) hoặc đã có PENDING (`"Bạn đã gửi yêu cầu tham gia gia đình này rồi"`) |
| `GET /me/join-requests` | JWT | Yêu cầu của tôi (mọi status, kèm `family { id, name }`, mới nhất trước) — màn theo dõi trạng thái |
| `POST /me/join-requests/:id/cancel` | JWT (chủ yêu cầu) | Chỉ khi PENDING → CANCELED. 400 nếu đã xử lý |
| `GET /families/:familyId/join-requests?status=` | JWT + FamilyPermissionGuard + `FAMILY_MANAGER` | Danh sách kèm `user { id, fullName, email, avatarUrl }`; filter status optional |
| `POST /families/:familyId/join-requests/:id/approve` | JWT + FamilyPermissionGuard + `FAMILY_MANAGER` + VerifiedGuard | Body optional `{ familyRole?, relationship? }` (default `FAMILY_MEMBER`/`OTHER`) — manager chọn vai trò **lúc duyệt**. Check trần `maxMembers` (`assertCanAddMember`), reactivate membership đã soft-remove, transaction (member write + request APPROVED + `decidedBy`). Trả `FamilyMember` |
| `POST /families/:familyId/join-requests/:id/reject` | JWT + FamilyPermissionGuard + `FAMILY_MANAGER` | PENDING → REJECTED + `decidedBy`. 400 nếu không PENDING |

Sau khi bị reject/cancel, user được gửi yêu cầu mới (chỉ chặn khi đang có
PENDING).

### Admin (SYSTEM_ADMIN)

`admin-invitations.controller.ts` → thay bằng
`admin-join-requests.controller.ts`: `GET /admin/join-requests` (paginated,
filter familyId/status), `GET /admin/join-requests/:id`,
`DELETE /admin/join-requests/:id`. Không có PATCH status — duyệt là nghiệp vụ
của FAMILY_MANAGER, admin chỉ tra cứu/dọn dữ liệu.

## 3. Bảo mật chống dò mã

- `@Throttle` trên 2 route nhận `:code` (~10 req/phút/IP — throttler đã có sẵn
  trong dự án, xem `auth.controller.ts`).
- Không bao giờ gia nhập trực tiếp bằng mã — luôn qua manager duyệt.
- Manager đổi mã bất kỳ lúc nào khi nghi lộ; mã cũ vô hiệu tức thì (so sánh
  trực tiếp cột `inviteCode`).
- Preview public chỉ trả `id` + `name` của family — không lộ danh sách thành
  viên.

## 4. Luồng người dùng cuối

```
Manager: tạo mã (regenerate) ──► mã K8ZQ4MPT hiện trên màn family, mọi thành viên copy/chia sẻ
User mới: đăng ký (email nào cũng được, không cần verify)
        ──► nhập mã ──► GET /invite-codes/:code (preview tên gia đình)
        ──► gửi yêu cầu (+ lời nhắn) ──► màn "Chờ duyệt" (GET /me/join-requests)
Manager: GET join-requests?status=PENDING ──► chọn vai trò/quan hệ ──► approve
        ──► user thành FamilyMember ACTIVE, family xuất hiện trong GET /families
```

## 5. Dọn dẹp & tài liệu & test

- Xóa module `invitations` cũ (controller/service/DTO/spec), tạo module
  `join-requests` theo pattern chuẩn của dự án.
- Cập nhật `app.module.ts` (thay InvitationsModule → JoinRequestsModule).
- Viết lại guide FE: xóa `INVITATIONS_API_GUIDE.md`, tạo
  `server/src/modules/join-requests/JOIN_FLOW_API_GUIDE.md` theo luồng mới.
- Cập nhật `CLAUDE.md` (mục trạng thái module + bảng DB).
- Unit test service `join-requests` (theo mẫu `invitations.service.spec.ts`
  cũ): tạo yêu cầu (chặn trùng PENDING/đã là thành viên), approve (cap,
  reactivate, transaction), reject/cancel, regenerate code (unique, quyền).
- Sau merge schema: `npx prisma validate` + `npx prisma generate` +
  `npx tsc --noEmit` (lưu ý Windows: tắt dev server/Studio trước khi generate).

## Ngoài phạm vi (YAGNI)

- Mã hết hạn / giới hạn số lần dùng — không cần vì có bước duyệt + đổi mã.
- Gửi email/notification khi có yêu cầu mới — module notifications còn stub;
  sẽ tích hợp khi module đó build (ghi chú trong guide để FE poll).
- QR code cho mã mời — FE tự render từ mã nếu muốn.
