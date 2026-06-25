# CLAUDE.md — Family Care Digital Management

> File context chung cho cả Claude và team. Mục tiêu: đồng nhất convention xuyên suốt
> dự án để không phải dò lại mỗi phiên. Viết bằng tiếng Việt, giữ nguyên từ khóa code/lệnh.

## 1. Tổng quan

Nền tảng **quản lý tài chính & chăm sóc gia đình số**. Đây là **monorepo**:

| Thư mục | Vai trò | Trạng thái |
|---------|---------|-----------|
| `server/` | Backend API (NestJS) | **Đang phát triển** — chứa toàn bộ code hiện tại |
| `admin/` | Admin Portal (web) | Chưa bắt đầu (thư mục rỗng) |
| `mobile/` | App di động | Chưa bắt đầu (thư mục rỗng) |

> Mọi hướng dẫn bên dưới áp dụng cho `server/` trừ khi nói khác. Khi `admin/`, `mobile/`
> bắt đầu có code, bổ sung mục riêng cho chúng.

## 2. Tech stack (backend `server/`)

- **NestJS 11** (TypeScript), kiến trúc module-based.
- **Prisma ORM + PostgreSQL** — ⚠️ **KHÔNG dùng TypeORM** (đã gỡ bỏ hoàn toàn; đừng
  import lại `@nestjs/typeorm`/`typeorm`).
- **Auth**: JWT (Passport-JWT) + **bcrypt**. Access token **15 phút**, refresh token
  **7 ngày**, **2 secret riêng biệt** (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`).
  Refresh token lưu **hash trong bảng `refresh_tokens`** (1 row/phiên-thiết bị, rotate +
  thu hồi từng phiên) — KHÔNG lưu trên `User`. JWT payload: `{ sub, email, userType }`
  (refresh token thêm `jti` = id row `refresh_tokens`).
- **Validation**: `class-validator` + `class-transformer` qua DTO.
- **Docs**: Swagger (`@nestjs/swagger`).
- **Node 20+**. TypeScript: `module: nodenext`, `isolatedModules: true`,
  `emitDecoratorMetadata: true` → **type dùng trong tham số có decorator phải
  `import type`** (nếu không sẽ lỗi TS1272).

## 3. Cấu trúc `server/src`

```
src/
├── main.ts                  # Bootstrap: global prefix, ValidationPipe, interceptor, filter, Swagger
├── app.module.ts            # Root module (ConfigModule global + PrismaModule + 21 feature module)
├── config/configuration.ts  # Đọc ENV → object config (app/database/jwt/bcrypt/invitation)
├── prisma/                  # PrismaModule (@Global) + PrismaService
├── common/                  # Dùng chung: interceptors / filters / decorators
└── modules/<feature>/       # 21 feature module
    ├── <feature>.module.ts
    ├── <feature>.controller.ts
    ├── <feature>.service.ts
    ├── dto/  guards/  decorators/  strategies/  types/   (tùy module)
```
- `prisma/schema.prisma` + `prisma/migrations/` ở **gốc `server/`** (không trong `src/`).

## 4. Trạng thái hiện tại

**Đã hoàn thiện:**
- Hạ tầng: `prisma`, `common`.
- Auth/định danh: `auth`, `users`.
- Gia đình: `families`, `family-members` (gồm `FamilyPermissionGuard` + `@FamilyRoles`),
  `invitations`.
- `finance` — **module lớn, đầy đủ**: ledger gia đình + ledger entry, `FinanceModel`/`FinanceJar`,
  `FinanceCategory`, `MemberMonthlyFinance`, **budget plan/line, financial goal + goal allocation,
  budget alert, spending support request** (controller trong `finance/controllers/`, service trong
  `finance/services/`). Route workspace-scoped dưới `families/:familyId/finance/...`.
- `admin` — **CRUD hệ thống** (SYSTEM_ADMIN) cho users / families / invitations / family-members
  (controller tách trong `admin/controllers/`).
- `subscription-plans` — **CRUD gói** (SYSTEM_ADMIN quản lý qua `admin/subscription-plans`; user đã
  đăng nhập xem gói active qua `subscription-plans`). Export `SubscriptionPlansService` cho module
  `subscriptions` dùng sau.

**Bảng DB đã có** (xem `prisma/schema.prisma`): `users`, `password_reset_tokens`, `refresh_tokens`,
`families`, `family_members`, `invitations`, `member_monthly_finances`, `finance_ledgers`,
`finance_categories`, `finance_models`, `finance_jars`, `ledger_entries`, `subscription_plans`,
`spending_support_requests`, `budget_plans`, `budget_lines`, `financial_goals`, `goal_allocations`,
`budget_alerts`.

**Module còn là stub rỗng** (`@Module({})`): ai-chatbot, albums, billing, calendar, chats, devices,
locations, messages, notifications, rewards, roles-permissions, sos, subscriptions, tasks.
→ Khi build, **theo đúng pattern của `auth`/`families`/`finance`** và các convention mục 5.

> ⚠️ Lưu ý vận hành (rút ra từ phiên gần đây): khi **merge/giải xung đột `schema.prisma`**, dễ rơi
> mất định nghĩa `model`/`enum` nhưng vẫn giữ relations + code → schema invalid, `tsc` lỗi hàng loạt
> ("Module '@prisma/client' has no exported member …"). Sau merge luôn chạy `npx prisma validate` +
> `npx prisma generate` + `npx tsc --noEmit` để phát hiện sớm; nếu thiếu model, khôi phục từ commit cũ
> đã có (đừng định nghĩa lại theo trí nhớ).

## 5. Convention BẮT BUỘC

### 5.1 Response envelope (đã đăng ký global ở `main.ts`)
> ⚠️ **Mọi `message` trả ra client MẶC ĐỊNH là TIẾNG VIỆT** (cả thành công lẫn lỗi). Khi
> viết API mới, luôn đặt message tiếng Việt — KHÔNG để tiếng Anh.

- **Thành công**: `{ "success": true, "message": "...", "data": <payload> }`
  - Do `common/interceptors/transform.interceptor.ts` bọc tự động (default `'Thành công'`).
  - Đặt message bằng decorator `@ResponseMessage('Đăng nhập thành công')` trên handler — **tiếng Việt**.
  - **Controller chỉ cần `return data`** — KHÔNG tự bọc `{ success, ... }`.
- **Lỗi**: `{ "success": false, "message": "...", "statusCode": <number> }`
  - Do `common/filters/all-exceptions.filter.ts` xử lý (fallback 500 = `'Lỗi hệ thống'`). Cứ
    `throw` các `HttpException` chuẩn của Nest với **message tiếng Việt**
    (`throw new ConflictException('Số điện thoại đã được sử dụng')`), tránh
    `throw new XxxException()` không có message (sẽ ra message tiếng Anh mặc định của Nest).
- **Lỗi validation (DTO)**: KHÔNG cần đặt `message` tiếng Việt trên từng decorator
  class-validator. `ValidationPipe` dùng `common/validation/vi-validation.factory.ts`
  (`viValidationExceptionFactory`) tự dịch sang tiếng Việt theo constraint key + nhãn field.
  Khi thêm field/constraint mới mà cần câu chữ riêng, bổ sung nhãn vào `FIELD_LABELS` hoặc
  case mới trong factory đó (đây là **nguồn chân lý** cho message validation).

### 5.2 Routing & docs
- **Mọi route có prefix `/api/v1`** (set ở `main.ts`). Ví dụ: `POST /api/v1/auth/login`.
- Swagger UI: `http://localhost:3000/api/docs`. Thêm `@ApiTags`, `@ApiOperation`,
  `@ApiBearerAuth()` cho route cần token.

### 5.3 Bảo mật
- **TUYỆT ĐỐI không trả `passwordHash`** ra client. Luôn dùng `sanitizeUser()` và type
  `SafeUser = Omit<User,'passwordHash'>` trong `modules/users/users.types.ts`.
- Hash password & refresh token bằng **bcrypt**; refresh token **rotate** mỗi lần refresh
  (revoke row cũ, tạo row mới trong `refresh_tokens`). Invitation token là chuỗi opaque,
  lưu **sha256** (`modules/invitations`) — raw token chỉ trả 1 lần.
- Secret/khoá đọc từ ENV qua `ConfigService` — **không hardcode**.

### 5.4 Data access
- Dùng **Prisma**: inject `PrismaService` (đã `@Global`, không cần import PrismaModule).
- Không tự mở kết nối DB; không thêm ORM khác.

### 5.5 Validation
- Mỗi input có **DTO + class-validator**. `ValidationPipe` global đã bật
  `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true` → field thừa sẽ bị
  từ chối (400). Quy tắc mật khẩu: ≥8 ký tự, có chữ hoa + thường + số + ký tự đặc biệt.

### 5.6 Phân quyền 2 lớp (tái sử dụng cho mọi module)
Quyền chia **2 lớp tách biệt** (đừng trộn lẫn) — vai trò gia đình KHÔNG nằm trên User:
- **`UserType`** `{NORMAL_USER, SYSTEM_ADMIN}` — loại tài khoản cấp hệ thống, nằm trên
  `User.userType`. Mặc định khi register = **`NORMAL_USER`**. Tạo family **không** đổi
  `userType` (vai trò quản lý gia đình thuộc lớp dưới). Trạng thái tài khoản dùng
  `User.accountStatus` `{ACTIVE, INACTIVE, SUSPENDED}` (thay cho `isActive` cũ).
- **`FamilyRole`** `{FAMILY_MANAGER, DEPUTY_MEMBER, FAMILY_MEMBER}` — quyền **trong từng
  family**, nằm trên `FamilyMember.familyRole`. Người tạo family = `FAMILY_MANAGER`.
- **`Relationship`** `{FATHER, MOTHER, SPOUSE, CHILD, SISTER, BROTHER, GRANDPARENT, OTHER}`
  — chỉ hiển thị.

Cách dùng guard/decorator:
- Đăng nhập: `@UseGuards(JwtAuthGuard)`.
- Quyền hệ thống (admin): `@UseGuards(JwtAuthGuard, RolesGuard)` +
  `@Roles(UserType.SYSTEM_ADMIN)` (`modules/auth/`).
- Quyền trong family: `@UseGuards(JwtAuthGuard, FamilyPermissionGuard)` +
  `@FamilyRoles(FamilyRole.FAMILY_MANAGER)` (`modules/family-members/`). Guard đọc
  `:familyId` từ params, kiểm tra membership + familyRole, gắn `request.familyMember`.
  **Route phải có param `:familyId`**.
- Lấy user hiện tại: `@CurrentUser()` (cả object `SafeUser`) hoặc `@CurrentUser('id')`.
- Lấy membership hiện tại (sau FamilyPermissionGuard): `@CurrentFamilyMember()` hoặc
  `@CurrentFamilyMember('id')`.

## 6. Lệnh thường dùng (chạy trong `server/`)

| Lệnh | Mục đích |
|------|----------|
| `npm install` | Cài deps; tự chạy `prisma generate` (postinstall) |
| `npm run start:dev` | Chạy API, hot reload |
| `npx prisma migrate dev` | Tạo/áp dụng migration ở local |
| `npx prisma migrate dev --name <change>` | Tạo migration mới sau khi sửa `schema.prisma` |
| `npx prisma migrate deploy` | Áp dụng migration ở production/CI (không hỏi) |
| `npm run prisma:studio` | Trình duyệt DB trực quan |
| `npm run test` / `npm run test:e2e` | Unit / e2e test |
| `npm run lint` | ESLint + tự fix |
| `npm run docker:db` | Bật Postgres dev bằng Docker (`docker compose up -d db`) |
| `npm run docker:prod` | Build + chạy production (api + db) trong Docker |

## 7. Môi trường & Docker

- **3 môi trường = 3 DB tách biệt**: máy dev A, máy dev B, production. Chỉ **code +
  `prisma/migrations/`** dùng chung qua git; dữ liệu độc lập từng nơi.
- `.env` / `.env.production` **không commit** (gitignored). Template: `.env.example`
  (local) và `.env.production.example` (Docker/production).
- **`DATABASE_URL` host**: `localhost` khi BE chạy ngoài Docker; `db` (tên service compose)
  khi BE chạy trong Docker.
- **Docker**: `server/Dockerfile` (multi-stage, node:20-slim + openssl),
  `docker-compose.yml` (Postgres cho dev), `docker-compose.prod.yml` (api + db + volume
  `pgdata`). Container api tự chạy `prisma migrate deploy` lúc khởi động.
- **Migration**: dev = `prisma migrate dev` (tạo); production/CI = `prisma migrate deploy`
  (chỉ áp dụng, không hỏi). Chi tiết onboarding & Docker: `server/SETUP.md`.

## 8. Cạm bẫy (gotchas)

- ❌ Đừng import TypeORM hay tạo entity `*.entity.ts` — dự án đã dùng Prisma.
- ⚠️ Type chỉ-là-type dùng trong tham số có decorator → phải `import type {...}`.
- ⏱️ Access token hết hạn sau 15 phút → `/me` trả 401 dù vừa login là bình thường,
  hãy `login` hoặc `refresh` lại.
- 📌 `package.json#prisma` (`{ "schema": ... }`) sẽ deprecated ở Prisma 7 — cân nhắc
  chuyển sang `prisma.config.ts` sau này (chưa gấp).
