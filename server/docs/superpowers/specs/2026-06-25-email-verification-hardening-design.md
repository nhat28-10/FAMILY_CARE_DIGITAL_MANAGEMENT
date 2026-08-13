# Thiết kế: Chuẩn hoá luồng xác thực tài khoản (Email OTP)

> Ngày: 2026-06-25 · Phạm vi: `server/` · Trạng thái: chờ review

## 1. Bối cảnh & mục tiêu

Luồng xác thực email OTP đã hoạt động (register tự gửi OTP → `verify-email` →
`VERIFIED`, có `resend-verification`). Tài liệu này **không xây lại** luồng đó mà
**chuẩn hoá** thêm 2 mảng còn thiếu so với chuẩn production:

1. **Soft gate**: tài khoản `UNVERIFIED` vẫn login + dùng gần như mọi thứ, nhưng
   **các hành động ghi nhạy cảm bị chặn** đến khi xác thực.
2. **Chống lạm dụng**: rate-limit theo IP cho các route auth (chống brute-force OTP,
   spam đăng nhập/đăng ký).

Mảng OTP/mail giữ nguyên (đã đạt chuẩn) — xem mục 5.

## 2. Hiện trạng (giữ nguyên)

- OTP 6 số, hash sha256, hết hạn 10 phút, cooldown resend 60s, tối đa 5 lần sai,
  mỗi lúc 1 mã sống. Bảng `email_verification_tokens`. Service
  `EmailVerificationService` ([server/src/modules/auth/email-verification.service.ts](../../../src/modules/auth/email-verification.service.ts)).
- `VerifiedGuard` đã tồn tại ([server/src/modules/auth/guards/verified.guard.ts](../../../src/modules/auth/guards/verified.guard.ts))
  nhưng **chưa gắn vào route nào** → đây là phần cần làm.
- Mail đa nhà cung cấp ([server/src/modules/mail/mail.service.ts](../../../src/modules/mail/mail.service.ts)):
  Resend / Brevo / SMTP + log fallback, tự dò theo ENV.

## 3. Phần A — Soft gate bằng `VerifiedGuard`

### Nguyên tắc
- Chỉ gate **thao tác GHI** (POST/PATCH/PUT/DELETE) mang tính cam kết / tài chính /
  mời người khác. **KHÔNG** gate GET (đọc) và sửa profile cá nhân.
- `VerifiedGuard` đặt **sau cùng** trong chuỗi guard (sau Jwt + guard quyền). Vì
  `JwtStrategy` nạp lại user từ DB mỗi request nên verify xong là mở khoá ngay ở
  request kế tiếp.
- Bị chặn → `403` + message tiếng Việt: *"Vui lòng xác thực tài khoản để dùng chức
  năng này"*. FE bắt 403 (message này) để hiện CTA "Xác thực ngay".

### Các route cần gate

| Module / file | Handler | Chuỗi guard sau khi sửa |
|---|---|---|
| [families.controller.ts](../../../src/modules/families/families.controller.ts) | `POST /families` (tạo gia đình) | `JwtAuthGuard, VerifiedGuard` |
| [invitations.controller.ts](../../../src/modules/invitations/invitations.controller.ts) | `POST /families/:familyId/invitations` (tạo lời mời), `POST .../invitations/:id/approve` (duyệt) | `JwtAuthGuard, FamilyPermissionGuard, VerifiedGuard` |
| [finance.controller.ts](../../../src/modules/finance/controllers/finance.controller.ts) | **Tất cả** handler ghi (POST/PUT/PATCH/DELETE): `models`, `jars`, `categories`, `support-requests`, `alerts/*`, `financial-goals*`, `goal-allocations*`, `budget-plans*`, `budget-lines*`, `ledger/entries`, `monthly-finances/me` | thêm `VerifiedGuard` vào chuỗi guard sẵn có |
| [family-subscription.controller.ts](../../../src/modules/subscriptions/controllers/family-subscription.controller.ts) | Handler mua gói / tạo checkout | thêm `VerifiedGuard` |

### KHÔNG gate (cố ý)
- Mọi route **GET** (đọc gia đình, giao dịch, gói...).
- Sửa profile cá nhân (tên, avatar) — nếu sau này thêm.
- ⚠️ [stripe-webhook.controller.ts](../../../src/modules/billing/controllers/stripe-webhook.controller.ts):
  **TUYỆT ĐỐI không gate** — Stripe gọi, không có JWT.

### Cách áp dụng
Thêm `VerifiedGuard` vào `@UseGuards(...)` **trên từng handler ghi** (không đặt ở
cấp controller, vì controller chứa cả route GET không gate). `VerifiedGuard` đã được
export từ `AuthModule`; các module đích import `AuthModule` (hoặc `VerifiedGuard`) nếu
chưa có.

## 4. Phần B — Rate-limit (`@nestjs/throttler`)

### Cài đặt
- Thêm package `@nestjs/throttler`.
- Đăng ký `ThrottlerModule.forRootAsync` (đọc ENV) trong `app.module.ts`, và 1
  `APP_GUARD` = `ThrottlerGuard` (global, áp mức mặc định thoáng cho toàn app).

### Mức giới hạn (mỗi IP) — đọc từ ENV, có default
| Route | Default | ENV |
|---|---|---|
| Toàn app (mặc định) | 100 req / 60s | `THROTTLE_TTL`, `THROTTLE_LIMIT` |
| `POST /auth/login` | 10 / 60s | `@Throttle` override |
| `POST /auth/register` | 5 / 60s | `@Throttle` override |
| `POST /auth/verify-email` | 10 / 60s | `@Throttle` override |
| `POST /auth/resend-verification` | 3 / 60s | `@Throttle` override (cộng dồn cooldown 60s sẵn có) |

> Mức override per-route đặt bằng decorator `@Throttle({ default: { limit, ttl } })`
> trên handler trong [auth.controller.ts](../../../src/modules/auth/auth.controller.ts).
> Default toàn app đọc từ ENV; các override để hằng số trong code (đủ rõ, ít thay đổi).

### Hành vi & message
- Vượt giới hạn → `429 Too Many Requests`.
- Trả message tiếng Việt *"Bạn thao tác quá nhanh, vui lòng thử lại sau"*: xử lý
  `ThrottlerException` trong [all-exceptions.filter.ts](../../../src/common/filters/all-exceptions.filter.ts)
  để giữ đúng response envelope `{ success:false, message, statusCode:429 }`.

### ENV mới
Thêm vào [.env.example](../../../.env.example) và
[.env.production.example](../../../.env.production.example):
```env
THROTTLE_TTL=60
THROTTLE_LIMIT=100
```

## 5. Mail provider — chốt Resend (local + prod)

| Môi trường | Cấu hình | Ghi chú |
|---|---|---|
| Local (dev hằng ngày) | Không set key → **log OTP ra console** | Zero setup, không tốn quota |
| Local (test mail thật) | `MAIL_PROVIDER=resend` + `RESEND_API_KEY` + `MAIL_FROM=onboarding@resend.dev` | Resend chỉ gửi tới email đã đăng ký Resend khi chưa verify domain |
| **Production (AZDIGI)** | `MAIL_PROVIDER=resend` + `RESEND_API_KEY` + `MAIL_FROM=no-reply@familycare-digital.com` (domain đã verify) | Qua cổng 443 (AZDIGI chặn SMTP); deliverability tốt |

Brevo/SMTP giữ làm dự phòng (code đã hỗ trợ), **Resend là mặc định**. `MailService`
tự dò provider theo ENV → không đổi code giữa 2 môi trường. (Phần này **đã code xong**,
chỉ tài liệu hoá quyết định.)

## 6. Ngoài phạm vi (ghi chú tương lai)
- Đổi email → verify lại: app chưa có chức năng tự đổi email (chỉ admin sửa user).
- Quên/đặt lại mật khẩu: bảng `password_reset_tokens` đã có nhưng là việc riêng.
- Dọn token hết hạn định kỳ (cron): chưa cần (mỗi lần gửi đã vô hiệu mã cũ).

## 7. Kiểm thử (end-to-end)
1. `npm run start:dev`, tạo tài khoản (UNVERIFIED) → gọi `POST /families` → kỳ vọng
   **403** *"Vui lòng xác thực tài khoản..."*.
2. Verify OTP (lấy mã từ console log) → gọi lại `POST /families` → **thành công**.
3. GET route (vd `GET /families/my`) khi UNVERIFIED → **vẫn 200** (không gate).
4. Gọi `POST /auth/resend-verification` 4 lần liên tiếp → lần vượt ngưỡng trả **429**
   đúng envelope tiếng Việt.
5. `npx prisma validate` (không đổi schema nên chủ yếu `tsc --noEmit`) + boot app sạch.
6. Webhook Stripe vẫn gọi được (không bị 401/403 do guard).
