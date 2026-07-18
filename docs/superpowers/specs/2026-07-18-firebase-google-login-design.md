# Design — Đăng nhập Google qua Firebase Auth (2026-07-18)

## Bối cảnh & mục tiêu

Người dùng muốn "đăng nhập Cognito dùng hạ tầng Firebase" — sau khi làm rõ, yêu cầu thực tế là
**social login kiểu managed-auth (như Cognito) nhưng dùng Firebase Authentication**, tận dụng
Firebase project + service account (`FIREBASE_SERVICE_ACCOUNT`) đang dùng cho kênh FCM.

- Provider hỗ trợ: **chỉ Google** (thêm Facebook/Apple sau chỉ cần bật trong Firebase Console,
  backend không đổi).
- Trùng email với tài khoản email/password sẵn có: **tự động liên kết** (chỉ khi
  `email_verified=true` trong ID token).
- Không dùng AWS Cognito. Không thay hệ JWT nội bộ — Firebase token chỉ dùng 1 lần lúc đăng nhập.

## Kiến trúc & luồng

```
Mobile (Firebase Auth SDK, Google provider)
  → nhận Firebase ID token
  → POST /api/v1/auth/firebase { idToken }
Backend (AuthService)
  → firebase-admin.verifyIdToken(idToken)   (cùng app instance với FCM)
  → find-or-create/link User
  → phát access token (15p) + refresh token (7d) nội bộ như login thường
```

Sau bước đăng nhập, mọi thứ (guards, refresh rotation, phân quyền 2 lớp) giữ nguyên hiện trạng.

## Thay đổi schema (1 migration)

- `User.passwordHash`: `String` → `String?` (user chỉ-có-Google không có mật khẩu).
- Thêm `User.firebaseUid String? @unique` (KHÔNG `@map` — bảng `users` hiện dùng cột
  camelCase, `schema.prisma` không có `@map` trên field nào của `User`; đổi sang
  snake_case sau này cần migration thật, không phải rename field).

## API mới

`POST /api/v1/auth/firebase` — public (không cần token), body `{ idToken: string }`.

Luồng xử lý:
1. `verifyIdToken(idToken)` — fail → 401 `"Token Google không hợp lệ hoặc đã hết hạn"`.
2. Tìm user theo `firebaseUid` → có → đăng nhập luôn.
3. Chưa có → tìm theo `email`:
   - tồn tại + `email_verified=true` → gắn `firebaseUid` vào tài khoản đó (auto-link),
     đồng thời nâng `verificationStatus=VERIFIED` (Google đã xác minh email, cùng bằng
     chứng sở hữu hộp thư như flow OTP);
   - tồn tại + `email_verified=false` → 401 từ chối (không link email chưa verify);
4. Không tồn tại → tạo user mới: `passwordHash=null`, `fullName`/`avatarUrl` lấy từ claims
   Google (`name`/`picture`), `verificationStatus=VERIFIED`.
5. Phát cặp token nội bộ như `login()`, cập nhật `lastLoginAt`.
6. Kiểm tra `accountStatus` như login thường (SUSPENDED/INACTIVE → từ chối).

Response: y hệt `POST /auth/login` (`{ user: SafeUser, accessToken, refreshToken }`),
message tiếng Việt qua `@ResponseMessage`.

## Ảnh hưởng luồng hiện có

- `POST /auth/login` với user có `passwordHash=null` → 400
  `"Tài khoản này đăng nhập bằng Google, vui lòng dùng nút Đăng nhập Google"`.
- Forgot-password với user không có mật khẩu → từ chối cùng message (không cho đặt mật khẩu
  lần đầu qua flow này — YAGNI, thêm sau nếu cần).
- `sanitizeUser()` đã loại `passwordHash` nên response không đổi; cần rà chỗ nào đọc
  `passwordHash` để null-safe.

## Cấu hình

- Backend: **không thêm ENV mới** — dùng lại `FIREBASE_SERVICE_ACCOUNT` (base64 service-account
  JSON). Nếu ENV rỗng (dev không có Firebase) → endpoint trả 503
  `"Đăng nhập Google chưa được cấu hình"` thay vì crash.
- Firebase Console: bật Sign-in provider **Google** (việc phía mobile/console, ngoài scope backend).

## Test

Unit test `AuthService` (mock `firebase-admin`):
- đăng nhập lại theo `firebaseUid` có sẵn;
- auto-link tài khoản email/password trùng email (`email_verified=true`);
- từ chối khi `email_verified=false`;
- tạo user mới khi email chưa tồn tại;
- token không hợp lệ → 401;
- login thường vào tài khoản `passwordHash=null` → 400 message tiếng Việt.
