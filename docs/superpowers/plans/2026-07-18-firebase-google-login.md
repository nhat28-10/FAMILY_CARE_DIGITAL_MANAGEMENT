# Đăng nhập Google qua Firebase Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm endpoint `POST /api/v1/auth/firebase` — mobile gửi Firebase ID token (đăng nhập Google), backend verify bằng `firebase-admin` rồi phát cặp access/refresh token nội bộ như login thường.

**Architecture:** Spec: `docs/superpowers/specs/2026-07-18-firebase-google-login-design.md`. Một service mới `FirebaseAuthService` (trong `modules/auth/`) khởi tạo app `firebase-admin` mặc định (cùng cách với kênh FCM, dùng chung ENV `FIREBASE_SERVICE_ACCOUNT`) và verify ID token. `AuthService.loginWithFirebase()` find-or-create/link user rồi tái dùng `buildAuthResult()` sẵn có. Schema: `User.passwordHash` thành nullable + thêm `User.firebaseUid` unique.

**Tech Stack:** NestJS 11, Prisma + PostgreSQL, `firebase-admin` (đã cài sẵn v13, đang dùng cho FCM), Jest.

## Global Constraints

- Mọi lệnh chạy trong thư mục `server/` (trừ git commit chạy ở gốc repo cũng được).
- Mọi message trả client là **TIẾNG VIỆT** (CLAUDE.md §5.1). Message cụ thể từng nhánh đã ghi trong task — copy đúng nguyên văn.
- KHÔNG import TypeORM. Data access qua `PrismaService`.
- Type chỉ-là-type trong tham số có decorator phải `import type` (TS1272).
- ⚠️ Windows: **tắt `npm run start:dev` và Prisma Studio trước khi chạy `prisma generate`/`migrate`** (file engine bị lock).
- ⚠️ `prisma migrate dev` bị chặn non-interactive trên máy này → tạo migration bằng `prisma migrate diff` rồi áp dụng bằng `prisma migrate deploy` (Task 1 có lệnh cụ thể).
- Commit message kết thúc bằng dòng `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Test chạy bằng `npm run test -- <pattern>`; toàn bộ: `npm run test`. Type-check: `npx tsc --noEmit`.

---

### Task 1: Migration schema + login thường với tài khoản không có mật khẩu

`passwordHash` thành nullable làm `auth.service.ts:119` (`bcrypt.compare(dto.password, user.passwordHash)`) lỗi type ngay sau `prisma generate`, nên task này gồm cả schema lẫn sửa `login()` để repo luôn compile được.

**Files:**
- Modify: `server/prisma/schema.prisma` (model `User`, ~dòng 294–313)
- Create: `server/prisma/migrations/20260718000000_add_firebase_login/migration.sql` (sinh bằng lệnh, không viết tay)
- Modify: `server/src/modules/auth/auth.service.ts` (method `login`, ~dòng 115–130)
- Create: `server/src/modules/auth/auth.service.spec.ts`

**Interfaces:**
- Produces: `User.passwordHash: string | null`, `User.firebaseUid: string | null` (unique) trong Prisma Client; `login()` ném `BadRequestException('Tài khoản này đăng nhập bằng Google, vui lòng dùng nút Đăng nhập Google')` khi `passwordHash` null.

- [ ] **Step 1: Sửa schema**

Trong `server/prisma/schema.prisma`, model `User`:

```prisma
  passwordHash       String?
```

(đổi từ `String` sang `String?`) và thêm ngay dưới `passwordHash`:

```prisma
  \ Firebase Auth UID — set khi user đăng nhập Google (social login). Null = chưa liên kết.
  firebaseUid        String?            @unique
```

(Các field khác của `User` không dùng `@map`, giữ nguyên style. Dấu `\` ở trên là comment `//` của Prisma — viết `//` trong file thật.)

Chạy: `npx prisma validate` → Expected: `The schema at prisma\schema.prisma is valid`.

- [ ] **Step 2: Tạo + áp dụng migration (KHÔNG dùng migrate dev)**

PowerShell, trong `server/` (đảm bảo dev server/Studio đã tắt):

```powershell
$dbUrl = ((Get-Content .env | Where-Object { $_ -match '^DATABASE_URL=' }) -replace '^DATABASE_URL=', '') -replace '"',''
New-Item -ItemType Directory -Force prisma/migrations/20260718000000_add_firebase_login
npx prisma migrate diff --from-url $dbUrl --to-schema-datamodel prisma/schema.prisma --script | Out-File -Encoding utf8NoBOM prisma/migrations/20260718000000_add_firebase_login/migration.sql
```

Mở file SQL vừa sinh kiểm tra: phải có `ALTER TABLE` bỏ NOT NULL trên cột password hash + thêm cột firebase uid + `CREATE UNIQUE INDEX`. Dùng đúng output của diff, không tự viết SQL. Rồi:

```powershell
npx prisma migrate deploy   # Expected: "1 migration applied" / tên 20260718000000_add_firebase_login
npx prisma generate         # Expected: "Generated Prisma Client"
```

- [ ] **Step 3: Xác nhận type lỗi đúng chỗ dự đoán**

Chạy: `npx tsc --noEmit`
Expected: FAIL tại `src/modules/auth/auth.service.ts:119` (bcrypt.compare không nhận `string | null`). Nếu có file khác lỗi vì `passwordHash` → sửa nốt theo cùng nguyên tắc (null = tài khoản Google).

- [ ] **Step 4: Viết failing test cho login**

Tạo `server/src/modules/auth/auth.service.spec.ts`:

```typescript
import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { AccountStatus, UserType, VerificationStatus } from '@prisma/client';

import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { EmailVerificationService } from './email-verification.service';
import type { PasswordResetService } from './password-reset.service';
import type { RefreshTokenService } from './refresh-token.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn().mockResolvedValue(false),
}));

const baseUser = {
  id: 'user-1',
  email: 'user@example.com',
  passwordHash: 'hash',
  fullName: 'User',
  phone: null,
  avatarUrl: null,
  userType: UserType.NORMAL_USER,
  accountStatus: AccountStatus.ACTIVE,
  verificationStatus: VerificationStatus.VERIFIED,
  firebaseUid: null,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService', () => {
  let usersService: {
    findByEmail: jest.Mock;
    findByPhone: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    updateLastLogin: jest.Mock;
  };
  let refreshTokens: { store: jest.Mock };
  let jwtService: { signAsync: jest.Mock; decode: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateLastLogin: jest.fn(),
    };
    refreshTokens = { store: jest.fn().mockResolvedValue(undefined) };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
      decode: jest
        .fn()
        .mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    };
    const emailVerification = {
      generateAndSend: jest.fn().mockResolvedValue(undefined),
    };
    const passwordReset = {};
    const config = {
      get: jest.fn((_key: string, def?: unknown) => def),
      getOrThrow: jest.fn().mockReturnValue('secret'),
    };

    service = new AuthService(
      usersService as unknown as UsersService,
      refreshTokens as unknown as RefreshTokenService,
      emailVerification as unknown as EmailVerificationService,
      passwordReset as unknown as PasswordResetService,
      jwtService as unknown as JwtService,
      config as unknown as ConfigService,
    );
  });

  describe('login', () => {
    it('rejects password login for a Google-only account (passwordHash null)', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...baseUser,
        passwordHash: null,
      });

      await expect(
        service.login({ email: baseUser.email, password: 'StrongP@ss1' }),
      ).rejects.toThrow(
        new BadRequestException(
          'Tài khoản này đăng nhập bằng Google, vui lòng dùng nút Đăng nhập Google',
        ),
      );
    });

    it('keeps the generic 401 for a wrong password', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);

      await expect(
        service.login({ email: baseUser.email, password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
```

- [ ] **Step 5: Chạy test xác nhận fail**

Run: `npm run test -- auth.service.spec`
Expected: FAIL — test 1 fail vì `login()` hiện crash/khác exception khi `passwordHash` null (tsc cũng đang fail từ Step 3).

- [ ] **Step 6: Sửa `login()`**

Trong `server/src/modules/auth/auth.service.ts`, thay body `login()` (dòng 115–130) bằng:

```typescript
  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);

    // Verify credentials. Use a generic message to avoid user enumeration.
    if (!user) {
      throw new UnauthorizedException('Thông tin đăng nhập không chính xác');
    }

    // Tài khoản social-only không có mật khẩu để so sánh.
    if (!user.passwordHash) {
      throw new BadRequestException(
        'Tài khoản này đăng nhập bằng Google, vui lòng dùng nút Đăng nhập Google',
      );
    }

    if (!(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Thông tin đăng nhập không chính xác');
    }

    if (user.accountStatus !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Tài khoản đã bị khóa');
    }

    // Stamp last login, then issue tokens with the updated record.
    const loggedInUser = await this.usersService.updateLastLogin(user.id);
    return this.buildAuthResult(loggedInUser);
  }
```

(`BadRequestException` đã có trong import ở đầu file.)

- [ ] **Step 7: Chạy test + type-check xác nhận pass**

Run: `npm run test -- auth.service.spec` → Expected: PASS (2 tests).
Run: `npx tsc --noEmit` → Expected: không còn lỗi.

- [ ] **Step 8: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260718000000_add_firebase_login server/src/modules/auth/auth.service.ts server/src/modules/auth/auth.service.spec.ts
git commit -m "feat(auth): passwordHash nullable + firebaseUid, chan login mat khau cho tai khoan Google"
```

---

### Task 2: Chặn forgot/reset-password cho tài khoản không có mật khẩu

Spec yêu cầu không cho đặt mật khẩu lần đầu qua flow reset. `requestReset` **im lặng bỏ qua** (return null) thay vì ném lỗi — giữ nguyên invariant chống dò email của service này (mọi nhánh của `requestReset` đều trả null im lặng); `reset` ném message chung `'Mã không hợp lệ hoặc đã hết hạn'`.

**Files:**
- Modify: `server/src/modules/auth/password-reset.service.ts` (methods `requestReset` ~dòng 39, `reset` ~dòng 73)
- Modify: `server/src/modules/auth/password-reset.service.spec.ts` (thêm 2 test)

**Interfaces:**
- Consumes: `User.passwordHash: string | null` (Task 1).
- Produces: không đổi signature; chỉ thêm nhánh guard.

- [ ] **Step 1: Viết 2 failing test**

Thêm vào `describe('requestReset', ...)` trong `password-reset.service.spec.ts`:

```typescript
    it('silently skips accounts without a password (Google-only)', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...activeUser,
        passwordHash: null,
      });

      await expect(service.requestReset(email)).resolves.toBeNull();

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordResetOtp).not.toHaveBeenCalled();
    });
```

Thêm vào `describe('reset', ...)`:

```typescript
    it('rejects accounts without a password with the generic message', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...activeUser,
        passwordHash: null,
      });

      await expect(
        service.reset(email, '123456', 'NewP@ssword1'),
      ).rejects.toThrow(
        new BadRequestException('Mã không hợp lệ hoặc đã hết hạn'),
      );
    });
```

**BẮT BUỘC:** thêm `passwordHash: 'hash',` vào object `activeUser` (dòng ~23–27 của spec, hiện chưa có field này). Không thêm thì guard mới ở Step 3 sẽ làm **toàn bộ test cũ** của spec này fail (chúng dùng `activeUser` không có `passwordHash` → bị coi là tài khoản Google-only).

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `npm run test -- password-reset.service.spec`
Expected: FAIL — 2 test mới fail (`create`/mail vẫn được gọi; `reset` không ném).

- [ ] **Step 3: Thêm guard**

Trong `requestReset()`, ngay sau check `accountStatus` (dòng 41–43), đổi điều kiện thành:

```typescript
    if (!user || user.accountStatus !== AccountStatus.ACTIVE || !user.passwordHash) {
      return null;
    }
```

Trong `reset()`, đổi điều kiện tương ứng (dòng 78–80) thành:

```typescript
    if (!user || user.accountStatus !== AccountStatus.ACTIVE || !user.passwordHash) {
      throw invalid();
    }
```

- [ ] **Step 4: Chạy test xác nhận pass**

Run: `npm run test -- password-reset.service.spec` → Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/auth/password-reset.service.ts server/src/modules/auth/password-reset.service.spec.ts
git commit -m "feat(auth): chan reset password cho tai khoan Google-only"
```

---

### Task 3: FirebaseAuthService — verify Firebase ID token

Service mới trong `modules/auth/`, khởi tạo app `firebase-admin` mặc định giống hệt `FcmNotificationChannel.onModuleInit()` (guard `admin.apps.length === 0` nên 2 bên dùng chung app, không phụ thuộc thứ tự init module).

**Files:**
- Create: `server/src/modules/auth/firebase-auth.service.ts`
- Create: `server/src/modules/auth/firebase-auth.service.spec.ts`
- Modify: `server/src/modules/auth/auth.module.ts` (thêm provider)

**Interfaces:**
- Produces: `FirebaseAuthService.verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken>` — ném `ServiceUnavailableException('Đăng nhập Google chưa được cấu hình')` khi ENV `FIREBASE_SERVICE_ACCOUNT` rỗng/hỏng; ném `UnauthorizedException('Token Google không hợp lệ hoặc đã hết hạn')` khi token sai. `DecodedIdToken` có các claim dùng sau: `uid`, `email?`, `email_verified?`, `name?`, `picture?`.

- [ ] **Step 1: Viết failing test**

Tạo `server/src/modules/auth/firebase-auth.service.spec.ts`:

```typescript
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { FirebaseAuthService } from './firebase-auth.service';

const mockVerifyIdToken = jest.fn();

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  auth: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

const serviceAccountB64 = Buffer.from(
  JSON.stringify({ projectId: 'demo', clientEmail: 'a@b.c', privateKey: 'k' }),
).toString('base64');

function makeService(envValue: string): FirebaseAuthService {
  const config = {
    get: jest.fn().mockReturnValue(envValue),
  } as unknown as ConfigService;
  const service = new FirebaseAuthService(config);
  service.onModuleInit();
  return service;
}

describe('FirebaseAuthService', () => {
  beforeEach(() => {
    mockVerifyIdToken.mockReset();
  });

  it('throws 503 when FIREBASE_SERVICE_ACCOUNT is empty', async () => {
    const service = makeService('');

    await expect(service.verifyIdToken('any')).rejects.toThrow(
      new ServiceUnavailableException('Đăng nhập Google chưa được cấu hình'),
    );
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it('returns the decoded token when Firebase accepts it', async () => {
    const decoded = { uid: 'fb-1', email: 'u@gmail.com', email_verified: true };
    mockVerifyIdToken.mockResolvedValue(decoded);
    const service = makeService(serviceAccountB64);

    await expect(service.verifyIdToken('good-token')).resolves.toBe(decoded);
    expect(mockVerifyIdToken).toHaveBeenCalledWith('good-token');
  });

  it('maps Firebase verification errors to 401 with a Vietnamese message', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('expired'));
    const service = makeService(serviceAccountB64);

    await expect(service.verifyIdToken('bad-token')).rejects.toThrow(
      new UnauthorizedException('Token Google không hợp lệ hoặc đã hết hạn'),
    );
  });
});
```

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `npm run test -- firebase-auth.service.spec`
Expected: FAIL — `Cannot find module './firebase-auth.service'`.

- [ ] **Step 3: Viết service**

Tạo `server/src/modules/auth/firebase-auth.service.ts`:

```typescript
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

/**
 * Verify Firebase ID token (đăng nhập Google trên mobile). Dùng chung app
 * firebase-admin mặc định với kênh FCM — cùng ENV `FIREBASE_SERVICE_ACCOUNT`
 * (base64 service-account JSON), guard `admin.apps.length` nên bên nào init
 * trước cũng được. ENV rỗng = tính năng tắt (dev không có Firebase) → 503.
 */
@Injectable()
export class FirebaseAuthService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseAuthService.name);
  private enabled = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const raw = this.config.get<string>('firebase.serviceAccount');
    if (!raw) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT trống — đăng nhập Google bị tắt.',
      );
      return;
    }
    try {
      const serviceAccount = JSON.parse(
        Buffer.from(raw, 'base64').toString('utf8'),
      ) as admin.ServiceAccount;
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }
      this.enabled = true;
    } catch (err) {
      this.logger.error(
        `FIREBASE_SERVICE_ACCOUNT không hợp lệ, tắt đăng nhập Google: ${(err as Error).message}`,
      );
    }
  }

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'Đăng nhập Google chưa được cấu hình',
      );
    }
    try {
      return await admin.auth().verifyIdToken(idToken);
    } catch {
      throw new UnauthorizedException(
        'Token Google không hợp lệ hoặc đã hết hạn',
      );
    }
  }
}
```

- [ ] **Step 4: Đăng ký provider**

Trong `server/src/modules/auth/auth.module.ts`: thêm `import { FirebaseAuthService } from './firebase-auth.service';` và thêm `FirebaseAuthService` vào mảng `providers` (không cần export — chỉ AuthService dùng).

- [ ] **Step 5: Chạy test xác nhận pass**

Run: `npm run test -- firebase-auth.service.spec` → Expected: PASS (3 tests).
Run: `npx tsc --noEmit` → Expected: sạch.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/auth/firebase-auth.service.ts server/src/modules/auth/firebase-auth.service.spec.ts server/src/modules/auth/auth.module.ts
git commit -m "feat(auth): FirebaseAuthService verify Firebase ID token"
```

---

### Task 4: `AuthService.loginWithFirebase()` — find-or-create/link user

**Files:**
- Modify: `server/src/modules/users/users.service.ts` (thêm 2 method)
- Modify: `server/src/modules/auth/auth.service.ts` (constructor + method mới)
- Modify: `server/src/modules/auth/auth.service.spec.ts` (harness + describe mới)

**Interfaces:**
- Consumes: `FirebaseAuthService.verifyIdToken(idToken)` (Task 3); `buildAuthResult(user)` sẵn có (auth.service.ts:248).
- Produces:
  - `UsersService.findByFirebaseUid(firebaseUid: string): Promise<User | null>`
  - `UsersService.linkFirebaseUid(id: string, firebaseUid: string): Promise<User>`
  - `AuthService.loginWithFirebase(dto: { idToken: string }): Promise<AuthResult>` — Task 5 gọi từ controller với `FirebaseLoginDto`.

- [ ] **Step 1: Thêm 2 method vào UsersService**

Thêm vào cuối class `UsersService` (`server/src/modules/users/users.service.ts`):

```typescript
  findByFirebaseUid(firebaseUid: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { firebaseUid } });
  }

  /** Gắn Firebase UID vào tài khoản sẵn có (auto-link đăng nhập Google). */
  linkFirebaseUid(id: string, firebaseUid: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { firebaseUid },
    });
  }
```

- [ ] **Step 2: Cập nhật harness + viết failing tests**

Trong `server/src/modules/auth/auth.service.spec.ts` (đã tạo ở Task 1):

1. Thêm import: `import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';` (gộp vào import `@nestjs/common` sẵn có) và `import type { FirebaseAuthService } from './firebase-auth.service';`.
2. Mở rộng mock `usersService` (cả khai báo type lẫn `beforeEach`) thêm `findByFirebaseUid: jest.fn()` và `linkFirebaseUid: jest.fn()`.
3. Thêm biến `let firebaseAuth: { verifyIdToken: jest.Mock };`, trong `beforeEach`: `firebaseAuth = { verifyIdToken: jest.fn() };`, và truyền thêm vào constructor **làm tham số cuối**:

```typescript
    service = new AuthService(
      usersService as unknown as UsersService,
      refreshTokens as unknown as RefreshTokenService,
      emailVerification as unknown as EmailVerificationService,
      passwordReset as unknown as PasswordResetService,
      jwtService as unknown as JwtService,
      config as unknown as ConfigService,
      firebaseAuth as unknown as FirebaseAuthService,
    );
```

4. Thêm describe mới:

```typescript
  describe('loginWithFirebase', () => {
    const decoded = {
      uid: 'fb-uid-1',
      email: 'google@gmail.com',
      email_verified: true,
      name: 'Google User',
      picture: 'https://lh3.googleusercontent.com/a/pic',
    };

    it('logs in an already-linked user by firebaseUid', async () => {
      firebaseAuth.verifyIdToken.mockResolvedValue(decoded);
      const linked = { ...baseUser, firebaseUid: decoded.uid };
      usersService.findByFirebaseUid.mockResolvedValue(linked);
      usersService.updateLastLogin.mockResolvedValue(linked);

      const result = await service.loginWithFirebase({ idToken: 't' });

      expect(result.user.id).toBe(baseUser.id);
      expect(result.accessToken).toBe('signed-token');
      expect(usersService.create).not.toHaveBeenCalled();
      expect(usersService.linkFirebaseUid).not.toHaveBeenCalled();
    });

    it('auto-links an existing email/password account when email is verified', async () => {
      firebaseAuth.verifyIdToken.mockResolvedValue(decoded);
      usersService.findByFirebaseUid.mockResolvedValue(null);
      const existing = { ...baseUser, email: decoded.email };
      usersService.findByEmail.mockResolvedValue(existing);
      const linked = { ...existing, firebaseUid: decoded.uid };
      usersService.linkFirebaseUid.mockResolvedValue(linked);
      usersService.updateLastLogin.mockResolvedValue(linked);

      await service.loginWithFirebase({ idToken: 't' });

      expect(usersService.linkFirebaseUid).toHaveBeenCalledWith(
        existing.id,
        decoded.uid,
      );
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('rejects when the Google email is missing or unverified', async () => {
      firebaseAuth.verifyIdToken.mockResolvedValue({
        ...decoded,
        email_verified: false,
      });
      usersService.findByFirebaseUid.mockResolvedValue(null);

      await expect(
        service.loginWithFirebase({ idToken: 't' }),
      ).rejects.toThrow(
        new UnauthorizedException('Tài khoản Google chưa xác minh email'),
      );
      expect(usersService.linkFirebaseUid).not.toHaveBeenCalled();
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('creates a new VERIFIED user without password when the email is unknown', async () => {
      firebaseAuth.verifyIdToken.mockResolvedValue(decoded);
      usersService.findByFirebaseUid.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue(null);
      const created = {
        ...baseUser,
        email: decoded.email,
        passwordHash: null,
        firebaseUid: decoded.uid,
      };
      usersService.create.mockResolvedValue(created);
      usersService.updateLastLogin.mockResolvedValue(created);

      await service.loginWithFirebase({ idToken: 't' });

      expect(usersService.create).toHaveBeenCalledWith({
        email: decoded.email,
        passwordHash: null,
        firebaseUid: decoded.uid,
        fullName: decoded.name,
        avatarUrl: decoded.picture,
        userType: UserType.NORMAL_USER,
        verificationStatus: VerificationStatus.VERIFIED,
      });
    });

    it('propagates verification failures from FirebaseAuthService', async () => {
      firebaseAuth.verifyIdToken.mockRejectedValue(
        new UnauthorizedException('Token Google không hợp lệ hoặc đã hết hạn'),
      );

      await expect(
        service.loginWithFirebase({ idToken: 'bad' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects locked accounts', async () => {
      firebaseAuth.verifyIdToken.mockResolvedValue(decoded);
      usersService.findByFirebaseUid.mockResolvedValue({
        ...baseUser,
        firebaseUid: decoded.uid,
        accountStatus: AccountStatus.SUSPENDED,
      });

      await expect(
        service.loginWithFirebase({ idToken: 't' }),
      ).rejects.toThrow(new ForbiddenException('Tài khoản đã bị khóa'));
    });
  });
```

- [ ] **Step 3: Chạy test xác nhận fail**

Run: `npm run test -- auth.service.spec`
Expected: FAIL — `loginWithFirebase is not a function` (hoặc lỗi constructor arity).

- [ ] **Step 4: Implement**

Trong `server/src/modules/auth/auth.service.ts`:

1. Import: `import { FirebaseAuthService } from './firebase-auth.service';`. (KHÔNG import DTO — `FirebaseLoginDto` tới Task 5 mới tồn tại; task này khai báo tham số bằng inline type `{ idToken: string }`, Task 5 sẽ đổi sang DTO.) Constructor thêm tham số cuối:

```typescript
    private readonly firebaseAuthService: FirebaseAuthService,
```

2. Thêm method sau `login()`:

```typescript
  /**
   * Đăng nhập bằng Google: verify Firebase ID token → tìm user theo
   * firebaseUid, chưa có thì auto-link theo email (đã verify) hoặc tạo mới,
   * rồi phát cặp token nội bộ như login thường.
   */
  async loginWithFirebase(dto: { idToken: string }): Promise<AuthResult> {
    const decoded = await this.firebaseAuthService.verifyIdToken(dto.idToken);

    let user = await this.usersService.findByFirebaseUid(decoded.uid);

    if (!user) {
      // Chỉ tin email đã được Google xác minh — điều kiện để auto-link an toàn.
      if (!decoded.email || !decoded.email_verified) {
        throw new UnauthorizedException('Tài khoản Google chưa xác minh email');
      }

      const existing = await this.usersService.findByEmail(decoded.email);
      user = existing
        ? await this.usersService.linkFirebaseUid(existing.id, decoded.uid)
        : await this.usersService.create({
            email: decoded.email,
            passwordHash: null,
            firebaseUid: decoded.uid,
            fullName: decoded.name ?? null,
            avatarUrl: decoded.picture ?? null,
            userType: UserType.NORMAL_USER,
            verificationStatus: VerificationStatus.VERIFIED,
          });
    }

    if (user.accountStatus !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Tài khoản đã bị khóa');
    }

    const loggedInUser = await this.usersService.updateLastLogin(user.id);
    return this.buildAuthResult(loggedInUser);
  }
```

Lưu ý: test case "creates a new VERIFIED user" expect `fullName: decoded.name` và `avatarUrl: decoded.picture` (không null vì decoded có đủ) — `?? null` chỉ chạy khi claim thiếu.

- [ ] **Step 5: Chạy test xác nhận pass**

Run: `npm run test -- auth.service.spec` → Expected: PASS (8 tests).
Run: `npx tsc --noEmit` → Expected: sạch.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/users/users.service.ts server/src/modules/auth/auth.service.ts server/src/modules/auth/auth.service.spec.ts
git commit -m "feat(auth): loginWithFirebase - find-or-create/link user tu Google"
```

---

### Task 5: DTO + endpoint `POST /auth/firebase` + hoàn thiện

**Files:**
- Create: `server/src/modules/auth/dto/firebase-login.dto.ts`
- Modify: `server/src/modules/auth/auth.service.ts` (đổi inline type → DTO)
- Modify: `server/src/modules/auth/auth.controller.ts` (endpoint mới)
- Modify: `server/src/common/validation/vi-validation.factory.ts` (`FIELD_LABELS`, ~dòng 4–16)

**Interfaces:**
- Consumes: `AuthService.loginWithFirebase({ idToken })` (Task 4).
- Produces: `POST /api/v1/auth/firebase` body `{ idToken: string }` → envelope thành công với `data = { user, accessToken, refreshToken }`, message `'Đăng nhập thành công'`.

- [ ] **Step 1: Tạo DTO**

Tạo `server/src/modules/auth/dto/firebase-login.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class FirebaseLoginDto {
  @ApiProperty({
    description: 'Firebase ID token nhận từ Firebase Auth SDK sau khi đăng nhập Google',
    example: 'eyJhbGciOiJSUzI1NiIs...',
  })
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}
```

- [ ] **Step 2: Nhãn validation tiếng Việt**

Trong `server/src/common/validation/vi-validation.factory.ts`, thêm vào `FIELD_LABELS`:

```typescript
  idToken: 'Token đăng nhập Google',
```

- [ ] **Step 3: Đổi signature service sang DTO**

Trong `server/src/modules/auth/auth.service.ts`: thêm `import { FirebaseLoginDto } from './dto/firebase-login.dto';` (cạnh các import DTO khác) và đổi `async loginWithFirebase(dto: { idToken: string })` thành `async loginWithFirebase(dto: FirebaseLoginDto)`.

- [ ] **Step 4: Endpoint controller**

Trong `server/src/modules/auth/auth.controller.ts`: thêm `import { FirebaseLoginDto } from './dto/firebase-login.dto';`, rồi thêm handler ngay sau `login` (sau dòng 65):

```typescript
  @Post('firebase')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Đăng nhập thành công')
  @ApiOperation({ summary: 'Đăng nhập bằng Google qua Firebase ID token' })
  @ApiBody({ type: FirebaseLoginDto })
  @ApiResponse({ status: 200, description: 'Login succeeded, tokens issued' })
  @ApiResponse({ status: 401, description: 'Invalid/expired Firebase token' })
  @ApiResponse({ status: 403, description: 'Account is locked' })
  @ApiResponse({ status: 503, description: 'Google login not configured' })
  firebaseLogin(@Body() dto: FirebaseLoginDto) {
    return this.authService.loginWithFirebase(dto);
  }
```

- [ ] **Step 5: Kiểm tra toàn cục**

Run: `npx tsc --noEmit` → Expected: sạch.
Run: `npm run lint` → Expected: sạch (tự fix nếu chỉ là format).
Run: `npm run test` → Expected: PASS toàn bộ suite (không chỉ 3 spec mới).

- [ ] **Step 6: Smoke test endpoint (không cần Firebase thật)**

Bật server (`npm run start:dev`) rồi:

```powershell
curl.exe -s -X POST http://localhost:3000/api/v1/auth/firebase -H "Content-Type: application/json" -d '{\"idToken\":\"fake\"}'
```

Expected (một trong hai, tùy `.env` máy đang chạy):
- `FIREBASE_SERVICE_ACCOUNT` rỗng → `{"success":false,"message":"Đăng nhập Google chưa được cấu hình","statusCode":503}`
- Có service account → `{"success":false,"message":"Token Google không hợp lệ hoặc đã hết hạn","statusCode":401}`

Body rỗng (`-d '{}'`) → 400 với message tiếng Việt chứa nhãn "Token đăng nhập Google". Tắt server sau khi xong.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/auth/dto/firebase-login.dto.ts server/src/modules/auth/auth.controller.ts server/src/modules/auth/auth.service.ts server/src/common/validation/vi-validation.factory.ts
git commit -m "feat(auth): endpoint POST /auth/firebase dang nhap Google"
```

---

## Ngoài scope backend (ghi nhận, không có task)

- Bật Sign-in provider **Google** trong Firebase Console của project đang dùng cho FCM.
- Mobile tích hợp Firebase Auth SDK, lấy ID token gửi lên `POST /api/v1/auth/firebase`.
- Không thêm ENV mới; production dùng `FIREBASE_SERVICE_ACCOUNT` sẵn có trong `.env.production`.
