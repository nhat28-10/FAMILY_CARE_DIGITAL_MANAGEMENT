# Email Verification Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chặn các thao tác ghi nhạy cảm với tài khoản chưa xác thực (soft gate) và thêm rate-limit chống lạm dụng cho các route auth.

**Architecture:** Gắn `VerifiedGuard` (đã có) vào từng handler ghi nhạy cảm ở các controller `families` / `invitations` / `finance` / `subscriptions`, đặt sau guard quyền sẵn có. Thêm `@nestjs/throttler` đăng ký global qua `APP_GUARD`, override mức chặt hơn cho route auth, và map `ThrottlerException` về envelope lỗi tiếng Việt.

**Tech Stack:** NestJS 11, TypeScript, `@nestjs/throttler`, Jest (unit), Prisma/PostgreSQL.

## Global Constraints

- Mọi `message` trả client là **tiếng Việt**.
- Response envelope chuẩn: lỗi = `{ success:false, message, statusCode }` (do `AllExceptionsFilter`).
- Controller chỉ `return data`; KHÔNG tự bọc `{ success }`.
- Type chỉ-là-type dùng trong tham số có decorator phải `import type` (tránh TS1272).
- Mọi route có prefix `/api/v1`.
- `VerifiedGuard` không có dependency DI → chỉ cần `import` class và dùng `@UseGuards(VerifiedGuard)`, KHÔNG cần khai báo provider/module ở controller đích.
- Chuỗi guard: guard cấp class chạy trước guard cấp method → `request.user` đã có khi `VerifiedGuard` chạy.
- Lệnh chạy trong thư mục `server/`. Typecheck: `node ./node_modules/typescript/bin/tsc --noEmit`. Unit test: `npm run test`.

---

### Task 1: Unit test cho `VerifiedGuard` (regression coverage)

`VerifiedGuard` đã tồn tại ([src/modules/auth/guards/verified.guard.ts](../../../src/modules/auth/guards/verified.guard.ts)) nhưng chưa có test. Bổ sung test khoá hành vi trước khi đem đi gắn vào loạt route.

**Files:**
- Test: `server/src/modules/auth/guards/verified.guard.spec.ts` (create)

**Interfaces:**
- Consumes: `VerifiedGuard.canActivate(context)` — ném `ForbiddenException` khi `request.user.verificationStatus !== 'VERIFIED'`, trả `true` khi đã VERIFIED.
- Produces: không có (chỉ test).

- [ ] **Step 1: Viết test**

```ts
import { ForbiddenException } from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';

import { VerifiedGuard } from './verified.guard';

function ctxWith(user: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

describe('VerifiedGuard', () => {
  const guard = new VerifiedGuard();

  it('cho qua khi user đã VERIFIED', () => {
    const ctx = ctxWith({ verificationStatus: VerificationStatus.VERIFIED });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('chặn khi user UNVERIFIED', () => {
    const ctx = ctxWith({ verificationStatus: VerificationStatus.UNVERIFIED });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('chặn khi không có user', () => {
    expect(() => guard.canActivate(ctxWith(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
```

- [ ] **Step 2: Chạy test**

Run: `npm run test -- verified.guard`
Expected: PASS (3 test). Nếu FAIL, sửa cho khớp hành vi guard hiện có (không sửa guard trừ khi sai logic).

- [ ] **Step 3: Commit**

```bash
git add src/modules/auth/guards/verified.guard.spec.ts
git commit -m "test: add VerifiedGuard unit tests"
```

---

### Task 2: Gắn `VerifiedGuard` vào các route ghi nhạy cảm

Áp `@UseGuards(VerifiedGuard)` ở **cấp method** cho các handler ghi. Không đặt cấp controller (vì controller có cả route GET không gate).

**Files:**
- Modify: `server/src/modules/families/families.controller.ts`
- Modify: `server/src/modules/invitations/invitations.controller.ts`
- Modify: `server/src/modules/finance/controllers/finance.controller.ts`
- Modify: `server/src/modules/subscriptions/controllers/family-subscription.controller.ts`

**Interfaces:**
- Consumes: `VerifiedGuard` từ `auth/guards/verified.guard`.
- Produces: các route ghi trả `403` (message *"Vui lòng xác thực tài khoản để dùng chức năng này"*) khi user UNVERIFIED.

- [ ] **Step 1: families — gate `POST /families`**

Thêm import + `@UseGuards(VerifiedGuard)` trên handler `create` (giữ class-level `@UseGuards(JwtAuthGuard)`):

```ts
// thêm vào import của auth guards
import { VerifiedGuard } from '../auth/guards/verified.guard';
```
```ts
  @Post()
  @UseGuards(VerifiedGuard)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo gia đình thành công')
  @ApiOperation({ summary: 'Create a family (creator becomes MANAGER)' })
  @ApiResponse({ status: 201, description: 'Family created' })
  @ApiResponse({ status: 403, description: 'Account not verified' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateFamilyDto) {
    return this.familiesService.create(userId, dto);
  }
```

- [ ] **Step 2: invitations — gate handler tạo lời mời và duyệt**

Mở `invitations.controller.ts`. Thêm `import { VerifiedGuard } from '../auth/guards/verified.guard';`. Trên 2 handler:
- handler `POST /families/:familyId/invitations` (tạo lời mời),
- handler `POST /families/:familyId/invitations/:id/approve` (duyệt),

thêm `@UseGuards(VerifiedGuard)` vào chuỗi `@UseGuards(...)` đang có (đặt VerifiedGuard **cuối cùng**), ví dụ:
```ts
  @UseGuards(FamilyPermissionGuard, VerifiedGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
```
KHÔNG đụng handler `claim` / `reject` của người được mời, `GET` preview, hay list.

- [ ] **Step 3: subscriptions — gate `POST checkout`**

Trong `family-subscription.controller.ts`, thêm `import { VerifiedGuard } from '../../auth/guards/verified.guard';` và sửa handler `createCheckout`:
```ts
  @Post('checkout')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...BILLING_MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo liên kết thanh toán Stripe để nâng gói' })
  @ResponseMessage('Tạo liên kết thanh toán thành công')
  createCheckout(
    @Param('familyId') familyId: string,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.subscriptionsService.createCheckout(familyId, dto.planCode);
  }
```
(Giữ class-level `@UseGuards(JwtAuthGuard, FamilyPermissionGuard)`.)

- [ ] **Step 4: finance — gate TẤT CẢ handler ghi**

Trong `finance.controller.ts`, thêm `import { VerifiedGuard } from '../../auth/guards/verified.guard';`. Class-level đang là `@UseGuards(JwtAuthGuard, FamilyPermissionGuard)` — GIỮ NGUYÊN. Thêm dòng `@UseGuards(VerifiedGuard)` ngay trên **mỗi** handler ghi dưới đây (POST/PUT/PATCH/DELETE). KHÔNG thêm cho bất kỳ handler `@Get(...)` nào.

Mẫu áp dụng (ví dụ cho 2 handler đầu):
```ts
  @Post('monthly-finances/me')
  @UseGuards(VerifiedGuard)
  // ...giữ nguyên các decorator khác + body handler
```
```ts
  @Put('monthly-finances/me')
  @UseGuards(VerifiedGuard)
  // ...
```

Danh sách đầy đủ handler ghi cần thêm `@UseGuards(VerifiedGuard)`:
`POST monthly-finances/me`, `PUT monthly-finances/me`, `POST models`, `PATCH models/:modelId/activate`, `POST jars`, `PATCH jars/:jarId`, `POST categories`, `POST support-requests`, `PATCH support-requests/:requestId/review`, `PATCH support-requests/:requestId/cancel`, `POST alerts/recompute`, `PATCH alerts/:alertId/acknowledge`, `PATCH alerts/:alertId/resolve`, `POST financial-goals`, `PATCH financial-goals/:goalId`, `PATCH financial-goals/:goalId/cancel`, `POST financial-goals/:goalId/allocations`, `PATCH goal-allocations/:allocationId`, `DELETE goal-allocations/:allocationId`, `POST budget-plans`, `PATCH budget-plans/:budgetPlanId`, `PATCH budget-plans/:budgetPlanId/activate`, `PATCH budget-plans/:budgetPlanId/close`, `PATCH budget-plans/:budgetPlanId/cancel`, `POST budget-plans/:budgetPlanId/lines`, `PATCH budget-lines/:budgetLineId`, `DELETE budget-lines/:budgetLineId`, `POST ledger/entries`.

- [ ] **Step 5: Typecheck**

Run: `node ./node_modules/typescript/bin/tsc --noEmit`
Expected: không lỗi.

- [ ] **Step 6: Runtime smoke — gating hoạt động**

Khởi động app (`npm run start:dev` hoặc nền), rồi kiểm tra bằng tài khoản UNVERIFIED (đăng ký mới, KHÔNG verify):

```powershell
# Đăng ký lấy token (verificationStatus = UNVERIFIED)
$email = "gate_$(Get-Random)@example.com"
$reg = Invoke-RestMethod http://localhost:3000/api/v1/auth/register -Method Post -ContentType 'application/json' -Body (@{email=$email;password='StrongP@ss1';fullName='Gate Test'}|ConvertTo-Json)
$t = $reg.data.accessToken
# Route ghi nhạy cảm → kỳ vọng 403
try { Invoke-RestMethod http://localhost:3000/api/v1/families -Method Post -ContentType 'application/json' -Headers @{Authorization="Bearer $t"} -Body (@{name='Nhà Test'}|ConvertTo-Json) } catch { ($_.ErrorDetails.Message | ConvertFrom-Json) }
# Route đọc → kỳ vọng 200 (không gate)
Invoke-RestMethod http://localhost:3000/api/v1/families/my -Headers @{Authorization="Bearer $t"}
```
Expected: `POST /families` trả `success:false, statusCode:403, message:"Vui lòng xác thực tài khoản để dùng chức năng này"`; `GET /families/my` trả `200`. (Sau khi verify OTP thì `POST /families` thành công — không bắt buộc test bước này tự động.)

- [ ] **Step 7: Commit**

```bash
git add src/modules/families/families.controller.ts src/modules/invitations/invitations.controller.ts src/modules/finance/controllers/finance.controller.ts src/modules/subscriptions/controllers/family-subscription.controller.ts
git commit -m "feat(auth): gate sensitive write routes behind email verification"
```

---

### Task 3: Hạ tầng throttler (install + config + ENV + đăng ký global)

**Files:**
- Modify: `server/package.json` (qua `npm install`)
- Modify: `server/src/config/configuration.ts`
- Modify: `server/.env.example`, `server/.env.production.example`
- Modify: `server/src/app.module.ts`

**Interfaces:**
- Consumes: `config.get('throttle.ttl')` (giây), `config.get('throttle.limit')`.
- Produces: `ThrottlerGuard` đăng ký `APP_GUARD` → mọi route áp mức mặc định; có thể override bằng `@Throttle`.

- [ ] **Step 1: Cài package**

Run: `npm install @nestjs/throttler`
Expected: thêm vào `dependencies`.

- [ ] **Step 2: Thêm config group**

Trong `configuration.ts`, thêm vào object trả về:
```ts
  throttle: {
    // TTL tính bằng GIÂY trong ENV; module sẽ nhân 1000 sang ms.
    ttl: parseInt(process.env.THROTTLE_TTL || '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },
```

- [ ] **Step 3: Thêm ENV mẫu**

Thêm vào cuối phần liên quan trong `.env.example` và `.env.production.example`:
```env
# ====== Rate limit (throttler) ======
THROTTLE_TTL=60
THROTTLE_LIMIT=100
```

- [ ] **Step 4: Đăng ký ThrottlerModule + APP_GUARD**

Trong `app.module.ts`, thêm imports:
```ts
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
```
Thêm vào mảng `imports` (sau `ConfigModule.forRoot`):
```ts
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            // @nestjs/throttler dùng ttl theo MILLIGIÂY.
            ttl: config.get<number>('throttle.ttl', 60) * 1000,
            limit: config.get<number>('throttle.limit', 100),
          },
        ],
      }),
    }),
```
Thêm `providers` cho `AppModule` (module hiện chưa có `providers` → thêm khối mới):
```ts
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
```

- [ ] **Step 5: Typecheck + boot**

Run: `node ./node_modules/typescript/bin/tsc --noEmit`
Expected: không lỗi.
Khởi động app → log có `Nest application successfully started`, không lỗi DI.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/config/configuration.ts src/app.module.ts .env.example .env.production.example
git commit -m "feat: add global rate limiting via @nestjs/throttler"
```

---

### Task 4: Siết throttle route auth + map `ThrottlerException` sang tiếng Việt

**Files:**
- Modify: `server/src/common/filters/all-exceptions.filter.ts`
- Test: `server/src/common/filters/all-exceptions.filter.spec.ts` (create)
- Modify: `server/src/modules/auth/auth.controller.ts`

**Interfaces:**
- Consumes: `ThrottlerException` (status 429) từ `@nestjs/throttler`.
- Produces: response 429 envelope `{ success:false, statusCode:429, message:"Bạn thao tác quá nhanh, vui lòng thử lại sau" }`.

- [ ] **Step 1: Viết test cho filter (map 429 → message VI)**

```ts
import { HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

import { AllExceptionsFilter } from './all-exceptions.filter';

function hostWith() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as any;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('map ThrottlerException sang 429 + message tiếng Việt', () => {
    const { host, status, json } = hostWith();
    filter.catch(new ThrottlerException(), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(json).toHaveBeenCalledWith({
      success: false,
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau',
    });
  });

  it('giữ message gốc cho HttpException thường', () => {
    const { host, json } = hostWith();
    filter.catch(new HttpException('Email đã được sử dụng', 409), host);
    expect(json).toHaveBeenCalledWith({
      success: false,
      statusCode: 409,
      message: 'Email đã được sử dụng',
    });
  });
});
```

- [ ] **Step 2: Chạy test (đỏ)**

Run: `npm run test -- all-exceptions.filter`
Expected: FAIL ở case throttler (message đang là tiếng Anh mặc định).

- [ ] **Step 3: Cập nhật filter**

Trong `all-exceptions.filter.ts`, thêm import:
```ts
import { ThrottlerException } from '@nestjs/throttler';
```
Ngay sau khi xác định `statusCode/message` từ `HttpException` (trước khi tạo `body`), thêm:
```ts
    if (exception instanceof ThrottlerException) {
      message = 'Bạn thao tác quá nhanh, vui lòng thử lại sau';
    }
```
(`ThrottlerException` là `HttpException` nên nhánh `instanceof HttpException` đã set `statusCode = 429`; đoạn trên chỉ override message.)

- [ ] **Step 4: Chạy test (xanh)**

Run: `npm run test -- all-exceptions.filter`
Expected: PASS cả 2 case.

- [ ] **Step 5: Override @Throttle cho route auth**

Trong `auth.controller.ts`, thêm import:
```ts
import { Throttle } from '@nestjs/throttler';
```
Thêm decorator `@Throttle` trên các handler (ttl theo MILLIGIÂY):
```ts
  // register
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
```
```ts
  // login
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
```
```ts
  // verifyEmail
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
```
```ts
  // resendVerification
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
```

- [ ] **Step 6: Typecheck**

Run: `node ./node_modules/typescript/bin/tsc --noEmit`
Expected: không lỗi.

- [ ] **Step 7: Runtime smoke — 429**

Khởi động app. Gọi `resend-verification` quá ngưỡng (limit 3/phút) bằng token của 1 user UNVERIFIED:
```powershell
$email = "thr_$(Get-Random)@example.com"
$reg = Invoke-RestMethod http://localhost:3000/api/v1/auth/register -Method Post -ContentType 'application/json' -Body (@{email=$email;password='StrongP@ss1';fullName='Thr'}|ConvertTo-Json)
$t = $reg.data.accessToken
1..5 | ForEach-Object {
  try { Invoke-RestMethod http://localhost:3000/api/v1/auth/resend-verification -Method Post -Headers @{Authorization="Bearer $t"} | Out-Null; "ok $_" }
  catch { "blocked $_ -> " + (($_.ErrorDetails.Message | ConvertFrom-Json).message) }
}
```
Expected: vài lần đầu OK/hoặc bị cooldown 400, đến khi vượt 3 req/phút thì trả `429` với message *"Bạn thao tác quá nhanh, vui lòng thử lại sau"*.

- [ ] **Step 8: Commit**

```bash
git add src/common/filters/all-exceptions.filter.ts src/common/filters/all-exceptions.filter.spec.ts src/modules/auth/auth.controller.ts
git commit -m "feat(auth): tighten rate limits on auth routes + Vietnamese 429 message"
```

---

## Verification (toàn cục, sau khi xong 4 task)

1. `node ./node_modules/typescript/bin/tsc --noEmit` → không lỗi.
2. `npm run test` → các unit test mới (VerifiedGuard, AllExceptionsFilter) pass, không vỡ test cũ.
3. Boot app sạch (`Nest application successfully started`), webhook Stripe (`POST /billing/...` hoặc route webhook) KHÔNG bị 401/403 do guard (không gắn guard vào webhook).
4. Smoke: UNVERIFIED → `POST /families` = 403; `GET /families/my` = 200; verify OTP xong → `POST /families` = 201; spam `resend-verification` → 429 tiếng Việt.
