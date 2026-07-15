# Family Invite Code + Join Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay luồng invitations cũ (email + token 64 hex, mời từng người) bằng mã mời ngắn 8 ký tự thuộc family (kiểu Zalo) + join request có manager duyệt.

**Architecture:** Thêm cột `inviteCode` (nullable, unique) vào `Family` — manager tạo/đổi mã, mọi thành viên xem. Model mới `JoinRequest` thay bảng `invitations`: user nhập mã → gửi yêu cầu PENDING → manager approve (tạo/reactivate `FamilyMember`) hoặc reject. Gỡ sạch module `invitations` cũ + admin CRUD lời mời.

**Tech Stack:** NestJS 11, Prisma + PostgreSQL, class-validator, @nestjs/throttler (đã có), Jest.

**Spec:** `docs/superpowers/specs/2026-07-14-family-invite-code-design.md`

## Global Constraints

- Mọi lệnh chạy trong thư mục `server/`.
- Mọi `message` trả client bằng **tiếng Việt**; controller chỉ `return data` (envelope tự bọc); đặt message qua `@ResponseMessage(...)`.
- Route prefix `/api/v1` tự có (set ở `main.ts`) — KHÔNG thêm vào path controller.
- Chỉ dùng Prisma (inject `PrismaService`, không cần import PrismaModule — đã @Global).
- Type chỉ-là-type trong tham số có decorator → `import type` (tránh TS1272).
- PK mọi model là `id`; FK dạng `<entity>Id`.
- ⚠️ Windows: **tắt dev server / Prisma Studio trước khi chạy** `prisma migrate dev` / `prisma generate` (lock query engine).
- Alphabet mã mời: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 ký tự, bỏ I/O/0/1), độ dài **8**.
- Sau mỗi task: `npx tsc --noEmit` phải PASS trước khi commit.

---

### Task 1: Gỡ luồng invitations cũ (code — chưa đụng schema)

Xóa module `invitations` + admin CRUD lời mời + config hết hạn. Schema/Prisma client vẫn còn model `Invitation` nên code còn lại compile bình thường; schema drop ở Task 2.

**Files:**
- Delete: `server/src/modules/invitations/` (toàn bộ thư mục: module, controller, service, spec, `dto/`, `INVITATIONS_API_GUIDE.md`)
- Delete: `server/src/modules/admin/controllers/admin-invitations.controller.ts`
- Delete: `server/src/modules/admin/dto/list-invitations-query.dto.ts`
- Delete: `server/src/modules/admin/dto/update-invitation.dto.ts`
- Modify: `server/src/app.module.ts` (bỏ import + đăng ký `InvitationsModule`)
- Modify: `server/src/modules/admin/admin.module.ts` (bỏ import + controller)
- Modify: `server/src/modules/admin/admin.service.ts` (bỏ 4 method + 2 import DTO + comment section "Invitations")
- Modify: `server/src/config/configuration.ts` (bỏ block `invitation`)
- Modify: `server/.env.example` (bỏ `INVITATION_EXPIRES_IN_DAYS` nếu có)

**Interfaces:**
- Consumes: —
- Produces: codebase không còn reference nào tới `InvitationsService`/`InvitationsModule`/`AdminInvitationsController`; các task sau xây module mới không đụng tên cũ.

- [ ] **Step 1: Xóa module invitations cũ**

```powershell
Remove-Item -Recurse -Force server/src/modules/invitations
Remove-Item -Force server/src/modules/admin/controllers/admin-invitations.controller.ts
Remove-Item -Force server/src/modules/admin/dto/list-invitations-query.dto.ts
Remove-Item -Force server/src/modules/admin/dto/update-invitation.dto.ts
```

- [ ] **Step 2: Gỡ đăng ký khỏi `app.module.ts`**

Xóa 2 dòng:

```ts
import { InvitationsModule } from './modules/invitations/invitations.module';
```

và `InvitationsModule,` trong mảng `imports`.

- [ ] **Step 3: Gỡ khỏi `admin.module.ts`**

Xóa dòng import `AdminInvitationsController` và phần tử `AdminInvitationsController,` trong mảng `controllers`. Sửa docblock của module: `users, families, invitations and family members` → `users, families, join requests and family members`.

- [ ] **Step 4: Gỡ khỏi `admin.service.ts`**

Xóa 2 dòng import:

```ts
import { AdminUpdateInvitationDto } from './dto/update-invitation.dto';
import { ListInvitationsQueryDto } from './dto/list-invitations-query.dto';
```

Xóa nguyên section (khoảng dòng 747–792) từ comment `// Invitations (tokenHash never returned)` đến hết method `deleteInvitation` (4 method: `listInvitations`, `getInvitation`, `updateInvitation`, `deleteInvitation`). Sửa docblock class: bỏ vế `and invitation token hashes are stripped`.

- [ ] **Step 5: Gỡ config hết hạn lời mời**

Trong `server/src/config/configuration.ts` xóa block:

```ts
  invitation: {
    expiresInDays: parseInt(process.env.INVITATION_EXPIRES_IN_DAYS || '7', 10),
  },
```

Trong `server/.env.example` xóa dòng `INVITATION_EXPIRES_IN_DAYS=...` (nếu có; kiểm tra cả `.env.production.example`).

- [ ] **Step 6: Xác nhận không còn reference**

Run: `Select-String -Path server/src -Pattern 'Invitation' -Recurse` (hoặc Grep `Invitation` trong `server/src`)
Expected: **0 kết quả** trong `server/src` (schema.prisma vẫn còn — sẽ xử lý ở Task 2).

- [ ] **Step 7: Verify compile + test + lint**

Run: `npx tsc --noEmit` → Expected: PASS (exit 0)
Run: `npm test` → Expected: PASS (spec cũ đã xóa cùng thư mục)
Run: `npm run lint` → Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A server/src server/.env.example
git commit -m "refactor: remove legacy email/token invitations flow"
```

---

### Task 2: Schema — `Family.inviteCode` + model `JoinRequest`, drop `Invitation`

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create (tự sinh): `server/prisma/migrations/<timestamp>_replace_invitations_with_invite_code_and_join_requests/`

**Interfaces:**
- Consumes: —
- Produces: Prisma client có `family.inviteCode: string | null`, model `prisma.joinRequest`, enum `JoinRequestStatus { PENDING, APPROVED, REJECTED, CANCELED }`. Relation names: `Family.joinRequests`, `User.joinRequests`, `FamilyMember.decidedJoinRequests`.

- [ ] **Step 1: Sửa `schema.prisma`**

Trong `model Family` thêm sau `activationStatus`:

```prisma
  /// Mã mời ngắn của gia đình (kiểu Zalo). Null = manager chưa tạo mã.
  inviteCode       String?          @unique @map("invite_code")
```

Trong `model Family` phần relations: xóa dòng `invitations             Invitation[]`, thêm:

```prisma
  joinRequests            JoinRequest[]
```

Trong `model User` phần relations: xóa dòng `claimedInvitations      Invitation[]               @relation("ClaimedBy")`, thêm:

```prisma
  joinRequests            JoinRequest[]
```

Trong `model FamilyMember` phần relations: xóa 2 dòng `createdInvitations` và `approvedInvitations` (kèm comment `/// Invitations created by this member...` phía trên), thêm:

```prisma
  decidedJoinRequests              JoinRequest[]              @relation("DecidedJoinRequests")
```

Xóa nguyên `model Invitation { ... }` (kèm `@@map("invitations")`) và nguyên `enum InvitationStatus { ... }`.

Thêm (đặt cạnh vị trí model Invitation cũ):

```prisma
/// Trạng thái yêu cầu tham gia gia đình bằng mã mời.
enum JoinRequestStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELED
}

/// Yêu cầu tham gia gia đình: user nhập mã mời của family và chờ manager duyệt.
model JoinRequest {
  id                String            @id @default(uuid())
  familyId          String
  userId            String
  status            JoinRequestStatus @default(PENDING)
  /// Lời nhắn của người xin vào (vd "Con là út của bố").
  message           String?
  /// Thành viên (manager) đã duyệt/từ chối yêu cầu.
  decidedByMemberId String?
  decidedAt         DateTime?
  createdAt         DateTime          @default(now())

  family          Family        @relation(fields: [familyId], references: [id], onDelete: Cascade)
  user            User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  decidedByMember FamilyMember? @relation("DecidedJoinRequests", fields: [decidedByMemberId], references: [id], onDelete: SetNull)

  @@index([familyId, status])
  @@index([userId])
  @@map("join_requests")
}
```

- [ ] **Step 2: Validate + tạo migration**

⚠️ Tắt dev server / Prisma Studio trước.

Run: `npx prisma validate` → Expected: `The schema ... is valid`
Run: `npx prisma migrate dev --name replace_invitations_with_invite_code_and_join_requests`
Expected: migration tạo thành công (DROP TABLE invitations, CREATE TABLE join_requests, ALTER TABLE families ADD invite_code) và `prisma generate` tự chạy. Nếu Prisma cảnh báo mất dữ liệu bảng `invitations` → chấp nhận (đã chốt trong spec).

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit` → Expected: PASS (không còn code nào import type `Invitation`).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): add Family.inviteCode + JoinRequest, drop Invitation"
```

---

### Task 3: Sinh mã mời + endpoint xem/đổi mã (module `families`)

**Files:**
- Create: `server/src/modules/families/invite-code.util.ts`
- Create: `server/src/modules/families/invite-code.util.spec.ts`
- Create: `server/src/modules/families/families.invite-code.spec.ts`
- Modify: `server/src/modules/families/families.service.ts`
- Modify: `server/src/modules/families/families.controller.ts`

**Interfaces:**
- Consumes: Prisma client từ Task 2 (`family.inviteCode`).
- Produces:
  - `generateInviteCode(): string` (8 ký tự, alphabet 32 ký tự) — export từ `invite-code.util.ts`, kèm export `INVITE_CODE_ALPHABET`, `INVITE_CODE_LENGTH`.
  - `FamiliesService.getInviteCode(familyId: string): Promise<{ inviteCode: string | null }>`
  - `FamiliesService.regenerateInviteCode(familyId: string): Promise<{ inviteCode: string }>`
  - Routes: `GET /families/:familyId/invite-code`, `POST /families/:familyId/invite-code/regenerate`.

- [ ] **Step 1: Viết test util (failing)**

`server/src/modules/families/invite-code.util.spec.ts`:

```ts
import {
  generateInviteCode,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
} from './invite-code.util';

describe('generateInviteCode', () => {
  it('sinh mã đúng độ dài 8', () => {
    expect(generateInviteCode()).toHaveLength(INVITE_CODE_LENGTH);
  });

  it('chỉ dùng ký tự trong alphabet (không I/O/0/1)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      for (const ch of code) {
        expect(INVITE_CODE_ALPHABET).toContain(ch);
      }
      expect(code).not.toMatch(/[IO01]/);
    }
  });

  it('các mã sinh ra khác nhau (xác suất trùng cực thấp)', () => {
    const codes = new Set(
      Array.from({ length: 1000 }, () => generateInviteCode()),
    );
    expect(codes.size).toBe(1000);
  });
});
```

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `npm test -- invite-code.util.spec`
Expected: FAIL — `Cannot find module './invite-code.util'`

- [ ] **Step 3: Viết util**

`server/src/modules/families/invite-code.util.ts`:

```ts
import { randomBytes } from 'node:crypto';

/** Alphabet 32 ký tự, bỏ I/O/0/1 để tránh đọc nhầm khi chia sẻ miệng. */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;

/** Sinh mã mời ngắn crypto-safe (32^8 ≈ 1.1e12 khả năng). */
export function generateInviteCode(): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    // 32 ký tự chia hết 256 → lấy modulo không bị lệch phân phối.
    code += INVITE_CODE_ALPHABET[bytes[i] % INVITE_CODE_ALPHABET.length];
  }
  return code;
}
```

- [ ] **Step 4: Chạy test util pass**

Run: `npm test -- invite-code.util.spec`
Expected: PASS (3 tests)

- [ ] **Step 5: Viết test service (failing)**

`server/src/modules/families/families.invite-code.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { FamiliesService } from './families.service';
import { INVITE_CODE_LENGTH } from './invite-code.util';

describe('FamiliesService invite code', () => {
  const familyId = 'family-id';

  let prisma: { family: Record<string, jest.Mock> };
  let service: FamiliesService;

  beforeEach(() => {
    prisma = {
      family: {
        findUnique: jest.fn(),
        update: jest.fn((args: { data: { inviteCode: string } }) => ({
          id: familyId,
          inviteCode: args.data.inviteCode,
        })),
      },
    };
    service = new FamiliesService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  describe('getInviteCode', () => {
    it('trả inviteCode (null khi chưa tạo)', async () => {
      prisma.family.findUnique.mockResolvedValue({ inviteCode: null });
      await expect(service.getInviteCode(familyId)).resolves.toEqual({
        inviteCode: null,
      });
    });

    it('404 khi family không tồn tại', async () => {
      prisma.family.findUnique.mockResolvedValue(null);
      await expect(service.getInviteCode(familyId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('regenerateInviteCode', () => {
    it('sinh mã mới 8 ký tự và lưu vào family', async () => {
      const result = await service.regenerateInviteCode(familyId);
      expect(result.inviteCode).toHaveLength(INVITE_CODE_LENGTH);
      expect(prisma.family.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: familyId } }),
      );
    });

    it('retry khi trùng mã (P2002) rồi thành công', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prisma.family.update
        .mockRejectedValueOnce(p2002)
        .mockImplementationOnce((args: { data: { inviteCode: string } }) => ({
          id: familyId,
          inviteCode: args.data.inviteCode,
        }));

      const result = await service.regenerateInviteCode(familyId);
      expect(result.inviteCode).toHaveLength(INVITE_CODE_LENGTH);
      expect(prisma.family.update).toHaveBeenCalledTimes(2);
    });
  });
});
```

- [ ] **Step 6: Chạy test xác nhận fail**

Run: `npm test -- families.invite-code.spec`
Expected: FAIL — `service.getInviteCode is not a function`

- [ ] **Step 7: Thêm method vào `families.service.ts`**

Thêm import ở đầu file (gộp vào import `@prisma/client` sẵn có và thêm util):

```ts
import { Prisma } from '@prisma/client';
import { generateInviteCode } from './invite-code.util';
```

Thêm 2 method vào cuối class `FamiliesService`:

```ts
  /** Mã mời hiện tại của family — null nếu manager chưa tạo. */
  async getInviteCode(familyId: string): Promise<{ inviteCode: string | null }> {
    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      select: { inviteCode: true },
    });
    if (!family) {
      throw new NotFoundException('Không tìm thấy gia đình');
    }
    return { inviteCode: family.inviteCode };
  }

  /**
   * Tạo mã lần đầu hoặc đổi mã (mã cũ vô hiệu ngay). Retry khi đụng unique
   * (xác suất cực thấp với không gian 32^8).
   */
  async regenerateInviteCode(familyId: string): Promise<{ inviteCode: string }> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const inviteCode = generateInviteCode();
      try {
        const family = await this.prisma.family.update({
          where: { id: familyId },
          data: { inviteCode },
          select: { inviteCode: true },
        });
        return { inviteCode: family.inviteCode! };
      } catch (error) {
        const isDuplicate =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002';
        if (!isDuplicate) throw error;
      }
    }
    throw new BadRequestException('Không thể tạo mã mời, vui lòng thử lại');
  }
```

- [ ] **Step 8: Chạy test service pass**

Run: `npm test -- families.invite-code.spec`
Expected: PASS (4 tests)

- [ ] **Step 9: Thêm 2 endpoint vào `families.controller.ts`**

Thêm sau method `getOne` (trước `update`):

```ts
  @Get(':familyId/invite-code')
  @UseGuards(FamilyPermissionGuard)
  @ResponseMessage('Lấy mã mời thành công')
  @ApiOperation({ summary: 'Get the family invite code (any active member)' })
  @ApiResponse({ status: 403, description: 'Not a member of this family' })
  getInviteCode(@Param('familyId') familyId: string) {
    return this.familiesService.getInviteCode(familyId);
  }

  @Post(':familyId/invite-code/regenerate')
  @UseGuards(FamilyPermissionGuard, VerifiedGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Tạo mã mời thành công')
  @ApiOperation({
    summary: 'Create or rotate the family invite code (FAMILY_MANAGER only)',
  })
  @ApiResponse({ status: 403, description: 'Requires family MANAGER role' })
  regenerateInviteCode(@Param('familyId') familyId: string) {
    return this.familiesService.regenerateInviteCode(familyId);
  }
```

(`Get`, `Post`, `HttpCode`, `HttpStatus`, `VerifiedGuard`, `FamilyRoles`, `FamilyRole` đã được import sẵn trong file.)

- [ ] **Step 10: Verify + commit**

Run: `npx tsc --noEmit` → PASS; `npm test` → PASS; `npm run lint` → PASS

```bash
git add server/src/modules/families
git commit -m "feat(families): invite code generation + view/regenerate endpoints"
```

---

### Task 4: `JoinRequestsService` + unit tests (TDD)

**Files:**
- Create: `server/src/modules/join-requests/join-requests.service.ts`
- Create: `server/src/modules/join-requests/join-requests.service.spec.ts`

**Interfaces:**
- Consumes: `FamilyMembersService.findByFamilyAndUser(familyId, userId): Promise<FamilyMember | null>`, `FamilyMembersService.assertCanAddMember(familyId): Promise<void>` (đã có sẵn).
- Produces (Task 5 gọi đúng các chữ ký này):
  - `previewByCode(code: string): Promise<{ family: { id: string; name: string; avatarUrl: string | null } }>`
  - `create(code: string, userId: string, dto: { message?: string }): Promise<JoinRequest>`
  - `listMine(userId: string): Promise<JoinRequest[]>`
  - `cancel(userId: string, id: string): Promise<JoinRequest>`
  - `listByFamily(familyId: string, status?: JoinRequestStatus): Promise<JoinRequest[]>`
  - `approve(familyId: string, approverMemberId: string, id: string, dto?: { familyRole?: FamilyRole; relationship?: Relationship }): Promise<FamilyMember>`
  - `reject(familyId: string, deciderMemberId: string, id: string): Promise<JoinRequest>`

- [ ] **Step 1: Viết service spec (failing)**

`server/src/modules/join-requests/join-requests.service.spec.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  FamilyRole,
  JoinRequestStatus,
  MemberStatus,
  Relationship,
} from '@prisma/client';

import { JoinRequestsService } from './join-requests.service';

describe('JoinRequestsService', () => {
  const familyId = 'family-id';
  const userId = 'user-id';
  const requestId = 'request-id';
  const managerMemberId = 'manager-member-id';
  const code = 'K8ZQ4MPT';

  const family = { id: familyId, name: 'Gia đình Phan', avatarUrl: null };

  const pendingRequest = {
    id: requestId,
    familyId,
    userId,
    status: JoinRequestStatus.PENDING,
    message: null,
    decidedByMemberId: null,
    decidedAt: null,
    createdAt: new Date(),
  };

  let prisma: {
    family: Record<string, jest.Mock>;
    joinRequest: Record<string, jest.Mock>;
    familyMember: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let familyMembers: {
    findByFamilyAndUser: jest.Mock;
    assertCanAddMember: jest.Mock;
  };
  let service: JoinRequestsService;

  beforeEach(() => {
    prisma = {
      family: { findUnique: jest.fn() },
      joinRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(pendingRequest),
        update: jest.fn(
          (args: { data: Partial<typeof pendingRequest> }) => ({
            ...pendingRequest,
            ...args.data,
          }),
        ),
      },
      familyMember: {
        create: jest.fn().mockResolvedValue({ id: 'new-member' }),
        update: jest.fn().mockResolvedValue({ id: 'reactivated-member' }),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    familyMembers = {
      findByFamilyAndUser: jest.fn().mockResolvedValue(null),
      assertCanAddMember: jest.fn().mockResolvedValue(undefined),
    };
    service = new JoinRequestsService(
      prisma as never,
      familyMembers as never,
    );
  });

  describe('previewByCode', () => {
    it('normalize mã (lowercase + space) rồi trả family', async () => {
      prisma.family.findUnique.mockResolvedValue(family);
      await expect(service.previewByCode(' k8zq4mpt ')).resolves.toEqual({
        family,
      });
      expect(prisma.family.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { inviteCode: code } }),
      );
    });

    it('404 khi mã không tồn tại', async () => {
      prisma.family.findUnique.mockResolvedValue(null);
      await expect(service.previewByCode('XXXXXXXX')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.family.findUnique.mockResolvedValue(family);
    });

    it('tạo yêu cầu PENDING kèm lời nhắn', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue(null);
      await service.create(code, userId, { message: 'Con là út' });
      expect(prisma.joinRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            familyId,
            userId,
            message: 'Con là út',
          }),
        }),
      );
    });

    it('409 khi đã là thành viên ACTIVE', async () => {
      familyMembers.findByFamilyAndUser.mockResolvedValue({
        status: MemberStatus.ACTIVE,
      });
      await expect(service.create(code, userId, {})).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('409 khi đã có yêu cầu PENDING', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue(pendingRequest);
      await expect(service.create(code, userId, {})).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('thành viên đã rời (INACTIVE) vẫn gửi yêu cầu được', async () => {
      familyMembers.findByFamilyAndUser.mockResolvedValue({
        status: MemberStatus.INACTIVE,
      });
      prisma.joinRequest.findFirst.mockResolvedValue(null);
      await expect(service.create(code, userId, {})).resolves.toBeDefined();
    });
  });

  describe('cancel', () => {
    it('chủ yêu cầu hủy khi PENDING → CANCELED', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue(pendingRequest);
      const result = await service.cancel(userId, requestId);
      expect(result.status).toBe(JoinRequestStatus.CANCELED);
    });

    it('404 khi yêu cầu không phải của mình', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue(null);
      await expect(service.cancel(userId, requestId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('400 khi yêu cầu đã xử lý', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue({
        ...pendingRequest,
        status: JoinRequestStatus.APPROVED,
      });
      await expect(service.cancel(userId, requestId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('approve', () => {
    beforeEach(() => {
      prisma.joinRequest.findFirst.mockResolvedValue(pendingRequest);
    });

    it('tạo member mới + đánh dấu APPROVED trong transaction', async () => {
      const member = await service.approve(
        familyId,
        managerMemberId,
        requestId,
        { familyRole: FamilyRole.DEPUTY_MEMBER },
      );
      expect(member).toEqual({ id: 'new-member' });
      expect(prisma.familyMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            familyId,
            userId,
            familyRole: FamilyRole.DEPUTY_MEMBER,
            relationship: Relationship.OTHER,
          }),
        }),
      );
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.joinRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: JoinRequestStatus.APPROVED,
            decidedByMemberId: managerMemberId,
          }),
        }),
      );
    });

    it('reactivate membership đã soft-remove thay vì tạo mới', async () => {
      familyMembers.findByFamilyAndUser.mockResolvedValue({
        status: MemberStatus.INACTIVE,
      });
      const member = await service.approve(
        familyId,
        managerMemberId,
        requestId,
      );
      expect(member).toEqual({ id: 'reactivated-member' });
      expect(prisma.familyMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { familyId_userId: { familyId, userId } },
          data: expect.objectContaining({
            status: MemberStatus.ACTIVE,
            leftAt: null,
          }),
        }),
      );
      expect(prisma.familyMember.create).not.toHaveBeenCalled();
    });

    it('chặn khi vượt trần thành viên của gói', async () => {
      familyMembers.assertCanAddMember.mockRejectedValue(
        new BadRequestException('Đã đạt số thành viên tối đa của gói hiện tại'),
      );
      await expect(
        service.approve(familyId, managerMemberId, requestId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('400 khi yêu cầu không còn PENDING', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue({
        ...pendingRequest,
        status: JoinRequestStatus.REJECTED,
      });
      await expect(
        service.approve(familyId, managerMemberId, requestId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 khi yêu cầu không thuộc family', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue(null);
      await expect(
        service.approve(familyId, managerMemberId, requestId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reject', () => {
    it('PENDING → REJECTED + ghi người quyết định', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue(pendingRequest);
      const result = await service.reject(
        familyId,
        managerMemberId,
        requestId,
      );
      expect(result.status).toBe(JoinRequestStatus.REJECTED);
      expect(result.decidedByMemberId).toBe(managerMemberId);
    });

    it('400 khi không còn PENDING', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue({
        ...pendingRequest,
        status: JoinRequestStatus.CANCELED,
      });
      await expect(
        service.reject(familyId, managerMemberId, requestId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
```

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `npm test -- join-requests.service.spec`
Expected: FAIL — `Cannot find module './join-requests.service'`

- [ ] **Step 3: Viết `join-requests.service.ts`**

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FamilyMember,
  FamilyRole,
  JoinRequest,
  JoinRequestStatus,
  MemberStatus,
  Relationship,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { FamilyMembersService } from '../family-members/family-members.service';

/** Thông tin family công khai cho màn nhập mã. */
const familyPreviewSelect = {
  id: true,
  name: true,
  avatarUrl: true,
} as const;

/** Thông tin user nhúng vào danh sách yêu cầu cho manager. */
const requesterSelect = {
  id: true,
  email: true,
  fullName: true,
  avatarUrl: true,
} as const;

@Injectable()
export class JoinRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly familyMembersService: FamilyMembersService,
  ) {}

  /** Tra family theo mã mời (đã normalize) — màn nhập mã, public. */
  async previewByCode(code: string) {
    const family = await this.findFamilyByCodeOrThrow(code);
    return { family };
  }

  /** User gửi yêu cầu tham gia bằng mã mời (chờ manager duyệt). */
  async create(
    code: string,
    userId: string,
    dto: { message?: string },
  ): Promise<JoinRequest> {
    const family = await this.findFamilyByCodeOrThrow(code);

    const existingMember = await this.familyMembersService.findByFamilyAndUser(
      family.id,
      userId,
    );
    if (existingMember && existingMember.status === MemberStatus.ACTIVE) {
      throw new ConflictException('Bạn đã là thành viên của gia đình này');
    }

    const pending = await this.prisma.joinRequest.findFirst({
      where: { familyId: family.id, userId, status: JoinRequestStatus.PENDING },
    });
    if (pending) {
      throw new ConflictException(
        'Bạn đã gửi yêu cầu tham gia gia đình này rồi',
      );
    }

    return this.prisma.joinRequest.create({
      data: { familyId: family.id, userId, message: dto.message ?? null },
      include: { family: { select: familyPreviewSelect } },
    });
  }

  /** Các yêu cầu của tôi (mọi trạng thái) — màn theo dõi. */
  listMine(userId: string): Promise<JoinRequest[]> {
    return this.prisma.joinRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { family: { select: familyPreviewSelect } },
    });
  }

  /** Chủ yêu cầu hủy khi còn PENDING. */
  async cancel(userId: string, id: string): Promise<JoinRequest> {
    const request = await this.prisma.joinRequest.findFirst({
      where: { id, userId },
    });
    if (!request) {
      throw new NotFoundException('Không tìm thấy yêu cầu tham gia');
    }
    if (request.status !== JoinRequestStatus.PENDING) {
      throw new BadRequestException('Yêu cầu đã được xử lý, không thể hủy');
    }
    return this.prisma.joinRequest.update({
      where: { id },
      data: { status: JoinRequestStatus.CANCELED },
    });
  }

  /** Danh sách yêu cầu của family cho manager (lọc status optional). */
  listByFamily(
    familyId: string,
    status?: JoinRequestStatus,
  ): Promise<JoinRequest[]> {
    return this.prisma.joinRequest.findMany({
      where: { familyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: requesterSelect } },
    });
  }

  /**
   * Manager duyệt yêu cầu → user thành thành viên ACTIVE. Manager chọn vai
   * trò/quan hệ lúc duyệt (default FAMILY_MEMBER/OTHER). Membership cũ đã
   * soft-remove được reactivate tại chỗ (unique familyId+userId).
   */
  async approve(
    familyId: string,
    approverMemberId: string,
    id: string,
    dto?: { familyRole?: FamilyRole; relationship?: Relationship },
  ): Promise<FamilyMember> {
    const request = await this.findPendingInFamilyOrThrow(
      familyId,
      id,
      'Chỉ có thể duyệt yêu cầu đang chờ',
    );
    const familyRole = dto?.familyRole ?? FamilyRole.FAMILY_MEMBER;
    const relationship = dto?.relationship ?? Relationship.OTHER;

    await this.familyMembersService.assertCanAddMember(familyId);

    const existing = await this.familyMembersService.findByFamilyAndUser(
      familyId,
      request.userId,
    );
    const memberWrite = existing
      ? this.prisma.familyMember.update({
          where: { familyId_userId: { familyId, userId: request.userId } },
          data: {
            status: MemberStatus.ACTIVE,
            leftAt: null,
            familyRole,
            relationship,
          },
        })
      : this.prisma.familyMember.create({
          data: { familyId, userId: request.userId, familyRole, relationship },
        });

    const [member] = await this.prisma.$transaction([
      memberWrite,
      this.prisma.joinRequest.update({
        where: { id: request.id },
        data: {
          status: JoinRequestStatus.APPROVED,
          decidedByMemberId: approverMemberId,
          decidedAt: new Date(),
        },
      }),
    ]);
    return member;
  }

  /** Manager từ chối yêu cầu đang chờ. */
  async reject(
    familyId: string,
    deciderMemberId: string,
    id: string,
  ): Promise<JoinRequest> {
    const request = await this.findPendingInFamilyOrThrow(
      familyId,
      id,
      'Chỉ có thể từ chối yêu cầu đang chờ duyệt',
    );
    return this.prisma.joinRequest.update({
      where: { id: request.id },
      data: {
        status: JoinRequestStatus.REJECTED,
        decidedByMemberId: deciderMemberId,
        decidedAt: new Date(),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Mã nhập từ client: trim + uppercase (không phân biệt hoa thường). */
  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private async findFamilyByCodeOrThrow(code: string) {
    const family = await this.prisma.family.findUnique({
      where: { inviteCode: this.normalizeCode(code) },
      select: familyPreviewSelect,
    });
    if (!family) {
      throw new NotFoundException('Mã mời không tồn tại');
    }
    return family;
  }

  private async findPendingInFamilyOrThrow(
    familyId: string,
    id: string,
    notPendingMessage: string,
  ): Promise<JoinRequest> {
    const request = await this.prisma.joinRequest.findFirst({
      where: { id, familyId },
    });
    if (!request) {
      throw new NotFoundException('Không tìm thấy yêu cầu tham gia');
    }
    if (request.status !== JoinRequestStatus.PENDING) {
      throw new BadRequestException(notPendingMessage);
    }
    return request;
  }
}
```

- [ ] **Step 4: Chạy test pass**

Run: `npm test -- join-requests.service.spec`
Expected: PASS (toàn bộ describe)

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/join-requests
git commit -m "feat(join-requests): service with code preview, create, cancel, approve, reject"
```

---

### Task 5: DTOs + controller + module `join-requests`, đăng ký app

**Files:**
- Create: `server/src/modules/join-requests/dto/create-join-request.dto.ts`
- Create: `server/src/modules/join-requests/dto/approve-join-request.dto.ts`
- Create: `server/src/modules/join-requests/dto/list-join-requests-query.dto.ts`
- Create: `server/src/modules/join-requests/join-requests.controller.ts`
- Create: `server/src/modules/join-requests/join-requests.module.ts`
- Modify: `server/src/app.module.ts`

**Interfaces:**
- Consumes: `JoinRequestsService` (Task 4), guards/decorators sẵn có (`JwtAuthGuard`, `FamilyPermissionGuard`, `FamilyRoles`, `VerifiedGuard`, `CurrentUser`, `CurrentFamilyMember`, `ResponseMessage`), `@Throttle` từ `@nestjs/throttler`.
- Produces: routes public/user/manager theo spec — FE gọi được toàn bộ luồng.

- [ ] **Step 1: DTOs**

`dto/create-join-request.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateJoinRequestDto {
  @ApiPropertyOptional({
    example: 'Con là út của bố',
    description: 'Lời nhắn gửi kèm cho quản lý gia đình',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
```

`dto/approve-join-request.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FamilyRole, Relationship } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

/**
 * Manager chọn vai trò/quan hệ lúc duyệt; bỏ trống dùng default
 * FAMILY_MEMBER / OTHER.
 */
export class ApproveJoinRequestDto {
  @ApiPropertyOptional({ enum: FamilyRole, default: FamilyRole.FAMILY_MEMBER })
  @IsOptional()
  @IsEnum(FamilyRole)
  familyRole?: FamilyRole;

  @ApiPropertyOptional({ enum: Relationship, default: Relationship.OTHER })
  @IsOptional()
  @IsEnum(Relationship)
  relationship?: Relationship;
}
```

`dto/list-join-requests-query.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { JoinRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListJoinRequestsQueryDto {
  @ApiPropertyOptional({
    enum: JoinRequestStatus,
    description: 'Lọc theo trạng thái (vd PENDING để xem yêu cầu chờ duyệt)',
  })
  @IsOptional()
  @IsEnum(JoinRequestStatus)
  status?: JoinRequestStatus;
}
```

- [ ] **Step 2: Controller**

`join-requests.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FamilyRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VerifiedGuard } from '../auth/guards/verified.guard';
import { CurrentFamilyMember } from '../family-members/decorators/current-family-member.decorator';
import { FamilyRoles } from '../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../family-members/guards/family-permission.guard';
import { ApproveJoinRequestDto } from './dto/approve-join-request.dto';
import { CreateJoinRequestDto } from './dto/create-join-request.dto';
import { ListJoinRequestsQueryDto } from './dto/list-join-requests-query.dto';
import { JoinRequestsService } from './join-requests.service';

@ApiTags('Join Requests')
@Controller()
export class JoinRequestsController {
  constructor(private readonly joinRequestsService: JoinRequestsService) {}

  @Get('invite-codes/:code')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ResponseMessage('Lấy thông tin mã mời thành công')
  @ApiOperation({ summary: 'Preview a family by invite code (public)' })
  @ApiResponse({ status: 404, description: 'Invite code not found' })
  preview(@Param('code') code: string) {
    return this.joinRequestsService.previewByCode(code);
  }

  @Post('invite-codes/:code/join-requests')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Gửi yêu cầu tham gia thành công')
  @ApiOperation({
    summary: 'Request to join a family by invite code (awaits approval)',
  })
  @ApiResponse({ status: 404, description: 'Invite code not found' })
  @ApiResponse({
    status: 409,
    description: 'Already a member or already has a pending request',
  })
  create(
    @Param('code') code: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateJoinRequestDto,
  ) {
    return this.joinRequestsService.create(code, userId, dto);
  }

  @Get('me/join-requests')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ResponseMessage('Lấy danh sách yêu cầu của bạn thành công')
  @ApiOperation({ summary: 'List my join requests (all statuses)' })
  listMine(@CurrentUser('id') userId: string) {
    return this.joinRequestsService.listMine(userId);
  }

  @Post('me/join-requests/:id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Hủy yêu cầu tham gia thành công')
  @ApiOperation({ summary: 'Cancel my pending join request' })
  @ApiResponse({ status: 400, description: 'Request already decided' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  cancel(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.joinRequestsService.cancel(userId, id);
  }

  @Get('families/:familyId/join-requests')
  @UseGuards(JwtAuthGuard, FamilyPermissionGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @ApiBearerAuth()
  @ResponseMessage('Lấy danh sách yêu cầu tham gia thành công')
  @ApiOperation({
    summary: 'List join requests of a family (FAMILY_MANAGER only)',
  })
  @ApiResponse({ status: 403, description: 'Requires family MANAGER role' })
  listByFamily(
    @Param('familyId') familyId: string,
    @Query() query: ListJoinRequestsQueryDto,
  ) {
    return this.joinRequestsService.listByFamily(familyId, query.status);
  }

  @Post('families/:familyId/join-requests/:id/approve')
  @UseGuards(JwtAuthGuard, FamilyPermissionGuard, VerifiedGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Duyệt yêu cầu tham gia thành công')
  @ApiOperation({
    summary: 'Approve a join request → creates the member (MANAGER only)',
  })
  @ApiResponse({ status: 400, description: 'Request is not PENDING' })
  @ApiResponse({ status: 403, description: 'Requires family MANAGER role' })
  approve(
    @Param('familyId') familyId: string,
    @Param('id') id: string,
    @CurrentFamilyMember('id') approverMemberId: string,
    @Body() dto: ApproveJoinRequestDto,
  ) {
    return this.joinRequestsService.approve(familyId, approverMemberId, id, dto);
  }

  @Post('families/:familyId/join-requests/:id/reject')
  @UseGuards(JwtAuthGuard, FamilyPermissionGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Từ chối yêu cầu tham gia thành công')
  @ApiOperation({ summary: 'Reject a join request (MANAGER only)' })
  @ApiResponse({ status: 400, description: 'Request is not PENDING' })
  @ApiResponse({ status: 403, description: 'Requires family MANAGER role' })
  reject(
    @Param('familyId') familyId: string,
    @Param('id') id: string,
    @CurrentFamilyMember('id') deciderMemberId: string,
  ) {
    return this.joinRequestsService.reject(familyId, deciderMemberId, id);
  }
}
```

- [ ] **Step 3: Module + đăng ký app**

`join-requests.module.ts`:

```ts
import { Module } from '@nestjs/common';

import { FamilyMembersModule } from '../family-members/family-members.module';
import { JoinRequestsController } from './join-requests.controller';
import { JoinRequestsService } from './join-requests.service';

@Module({
  imports: [FamilyMembersModule],
  controllers: [JoinRequestsController],
  providers: [JoinRequestsService],
  exports: [JoinRequestsService],
})
export class JoinRequestsModule {}
```

Trong `app.module.ts` thêm (đúng chỗ `InvitationsModule` cũ đứng):

```ts
import { JoinRequestsModule } from './modules/join-requests/join-requests.module';
```

và `JoinRequestsModule,` vào mảng `imports` (sau `FinanceModule,`).

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` → PASS; `npm test` → PASS; `npm run lint` → PASS
Run: `npm run start:dev` rồi mở `http://localhost:3000/api/docs` → thấy tag **Join Requests** với 7 route + 2 route invite-code dưới tag **Families**. Dừng server sau khi kiểm tra.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/join-requests server/src/app.module.ts
git commit -m "feat(join-requests): controller, DTOs, module registration"
```

---

### Task 6: Admin tra cứu join requests (SYSTEM_ADMIN)

**Files:**
- Create: `server/src/modules/admin/dto/list-join-requests-query.dto.ts`
- Create: `server/src/modules/admin/controllers/admin-join-requests.controller.ts`
- Modify: `server/src/modules/admin/admin.service.ts`
- Modify: `server/src/modules/admin/admin.module.ts`

**Interfaces:**
- Consumes: `PaginationQueryDto` (`common/dto/pagination-query.dto`), helpers `skipFor`/`buildPaginated` (đã import sẵn trong `admin.service.ts`).
- Produces: `AdminService.listJoinRequests(q)`, `getJoinRequest(id)`, `deleteJoinRequest(id)`; routes `GET/DELETE /admin/join-requests[...]`. Không có PATCH — duyệt là nghiệp vụ của FAMILY_MANAGER.

- [ ] **Step 1: DTO**

`dto/list-join-requests-query.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { JoinRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListJoinRequestsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: JoinRequestStatus })
  @IsOptional()
  @IsEnum(JoinRequestStatus)
  status?: JoinRequestStatus;

  @ApiPropertyOptional({ description: 'Filter by family id' })
  @IsOptional()
  @IsUUID()
  familyId?: string;
}
```

- [ ] **Step 2: Service methods**

Trong `admin.service.ts` thêm import:

```ts
import { ListJoinRequestsQueryDto } from './dto/list-join-requests-query.dto';
```

Thêm section (chỗ section Invitations cũ, trước `// Family members`):

```ts
  // --------------------------------------------------------------------------
  // Join requests (đọc/xóa — duyệt là nghiệp vụ của FAMILY_MANAGER)
  // --------------------------------------------------------------------------

  async listJoinRequests(q: ListJoinRequestsQueryDto) {
    const where: Prisma.JoinRequestWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.familyId) where.familyId = q.familyId;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.joinRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipFor(q.page, q.limit),
        take: q.limit,
        include: {
          user: { select: memberUserSelect },
          family: { select: { id: true, name: true } },
        },
      }),
      this.prisma.joinRequest.count({ where }),
    ]);

    return buildPaginated(items, total, q.page, q.limit);
  }

  async getJoinRequest(id: string) {
    const request = await this.prisma.joinRequest.findUnique({
      where: { id },
      include: {
        user: { select: memberUserSelect },
        family: { select: { id: true, name: true } },
      },
    });
    if (!request) {
      throw new NotFoundException('Không tìm thấy yêu cầu tham gia');
    }
    return request;
  }

  async deleteJoinRequest(id: string): Promise<null> {
    await this.getJoinRequest(id);
    await this.prisma.joinRequest.delete({ where: { id } });
    return null;
  }
```

- [ ] **Step 3: Controller**

`controllers/admin-join-requests.controller.ts`:

```ts
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JoinRequestStatus, UserType } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AdminService } from '../admin.service';
import { ListJoinRequestsQueryDto } from '../dto/list-join-requests-query.dto';

@ApiTags('Admin - Join Requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.SYSTEM_ADMIN)
@Controller('admin/join-requests')
export class AdminJoinRequestsController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  @ResponseMessage('Lấy danh sách yêu cầu tham gia thành công')
  @ApiOperation({ summary: 'List join requests (paginated, SYSTEM_ADMIN)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: JoinRequestStatus })
  @ApiQuery({ name: 'familyId', required: false, type: String })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  list(@Query() query: ListJoinRequestsQueryDto) {
    return this.admin.listJoinRequests(query);
  }

  @Get(':id')
  @ResponseMessage('Lấy thông tin yêu cầu tham gia thành công')
  @ApiOperation({ summary: 'Get a join request by id' })
  @ApiParam({ name: 'id', description: 'Join request UUID' })
  @ApiResponse({ status: 404, description: 'Join request not found' })
  get(@Param('id') id: string) {
    return this.admin.getJoinRequest(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Xóa yêu cầu tham gia thành công')
  @ApiOperation({ summary: 'Delete a join request' })
  @ApiParam({ name: 'id', description: 'Join request UUID' })
  @ApiResponse({ status: 404, description: 'Join request not found' })
  remove(@Param('id') id: string) {
    return this.admin.deleteJoinRequest(id);
  }
}
```

Trong `admin.module.ts`: thêm import `AdminJoinRequestsController` từ `./controllers/admin-join-requests.controller` và thêm vào mảng `controllers` (chỗ `AdminInvitationsController` cũ).

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit` → PASS; `npm test` → PASS; `npm run lint` → PASS

```bash
git add server/src/modules/admin
git commit -m "feat(admin): join request lookup/delete endpoints"
```

---

### Task 7: Tài liệu — guide FE mới + cập nhật CLAUDE.md

**Files:**
- Create: `server/src/modules/join-requests/JOIN_FLOW_API_GUIDE.md`
- Modify: `CLAUDE.md` (gốc repo)

**Interfaces:**
- Consumes: spec `docs/superpowers/specs/2026-07-14-family-invite-code-design.md` (mục 2 — bảng endpoint, mục 4 — luồng người dùng).
- Produces: guide FE hoàn chỉnh thay `INVITATIONS_API_GUIDE.md` đã xóa.

- [ ] **Step 1: Viết `JOIN_FLOW_API_GUIDE.md`**

Theo format của `server/src/modules/sos/SOS_API_GUIDE.md` (đã là chuẩn của repo). Nội dung bắt buộc:

1. **Chuẩn bị chung**: base URL `/api/v1`, envelope success/error, auth (login/refresh), bảng phân quyền (tạo/đổi mã = FAMILY_MANAGER + VERIFIED; xem mã = mọi thành viên ACTIVE; preview mã = public; gửi/hủy yêu cầu = user đăng nhập, KHÔNG cần VERIFIED; duyệt = MANAGER + VERIFIED; từ chối = MANAGER).
2. **Cơ chế mã mời**: 8 ký tự alphabet `A-H J-N P-Z 2-9`, không phân biệt hoa thường, thuộc family, tái sử dụng, đổi mã làm mã cũ vô hiệu ngay, null khi chưa tạo (FE hiện nút "Tạo mã" cho manager), rate-limit 10 req/phút trên route nhận `:code`.
3. **State machine**: `PENDING → APPROVED | REJECTED | CANCELED` (một chiều, không quay lại; bị từ chối/hủy thì gửi yêu cầu mới).
4. **9 endpoint** với method/path/body/response mẫu + bảng lỗi tiếng Việt đúng message trong service (Task 3–5): `Mã mời không tồn tại` (404), `Bạn đã là thành viên của gia đình này` (409), `Bạn đã gửi yêu cầu tham gia gia đình này rồi` (409), `Yêu cầu đã được xử lý, không thể hủy` (400), `Chỉ có thể duyệt yêu cầu đang chờ` (400), `Chỉ có thể từ chối yêu cầu đang chờ duyệt` (400), `Đã đạt số thành viên tối đa của gói hiện tại` (403), `Vui lòng xác thực tài khoản để dùng chức năng này` (403).
5. **Luồng màn hình FE**: phía manager (tạo/copy/đổi mã, màn duyệt với chọn vai trò/quan hệ) và phía người xin vào (đăng ký email nào cũng được → nhập mã → preview → gửi kèm lời nhắn → màn "Yêu cầu của tôi" theo dõi status — chưa có realtime, FE poll `GET /me/join-requests`).
6. **Checklist test nhanh** qua Swagger: manager tạo mã → user 2 preview + gửi yêu cầu → manager list PENDING → approve → user 2 thấy family trong `GET /families/my`.

- [ ] **Step 2: Cập nhật `CLAUDE.md`**

- Mục 4 "Đã hoàn thiện": thay `invitations` bằng `join-requests` (mô tả: mã mời family kiểu Zalo + yêu cầu tham gia có duyệt).
- Bảng DB: thay `invitations` bằng `join_requests`.
- Mục admin: thay `invitations` bằng `join-requests` trong danh sách CRUD.
- Mục 2 (nếu nhắc invitation token sha256): cập nhật thành mã mời ngắn lưu plaintext trên `Family.inviteCode`.

- [ ] **Step 3: Commit**

```bash
git add server/src/modules/join-requests/JOIN_FLOW_API_GUIDE.md CLAUDE.md
git commit -m "docs: FE guide for invite code + join request flow"
```

---

### Task 8: Verification cuối — full suite + smoke test luồng thật

**Files:** không tạo file mới (fix nếu phát hiện lỗi).

- [ ] **Step 1: Full suite**

Run trong `server/`:

```bash
npx prisma validate && npx tsc --noEmit && npm run lint && npm test
```

Expected: tất cả PASS.

- [ ] **Step 2: Smoke test luồng end-to-end**

Bật DB (`npm run docker:db` nếu chưa) + `npm run start:dev`, rồi chạy tuần tự (PowerShell, dùng `Invoke-RestMethod` hoặc curl):

1. Đăng ký user A (manager) + user B — `POST /api/v1/auth/register` (lưu accessToken mỗi người). Nếu account cần VERIFIED để tạo family/mã: verify user A theo luồng verify email hiện có (hoặc set `verificationStatus=VERIFIED` trực tiếp qua Prisma Studio/SQL cho nhanh).
2. A tạo family → lưu `familyId`.
3. A: `POST /families/{familyId}/invite-code/regenerate` → nhận `{ inviteCode }` 8 ký tự.
4. A: `GET /families/{familyId}/invite-code` → trả đúng mã vừa tạo.
5. Không token: `GET /invite-codes/{code}` (thử cả chữ thường) → 200, thấy `family.name`.
6. B: `POST /invite-codes/{code}/join-requests` body `{ "message": "Cho em vào với" }` → 201 PENDING.
7. B lặp lại bước 6 → 409 `Bạn đã gửi yêu cầu tham gia gia đình này rồi`.
8. B: `GET /me/join-requests` → thấy 1 yêu cầu PENDING kèm `family.name`.
9. A: `GET /families/{familyId}/join-requests?status=PENDING` → thấy yêu cầu của B kèm `user.email`.
10. A: `POST /families/{familyId}/join-requests/{id}/approve` body `{ "relationship": "CHILD" }` → 200, trả FamilyMember ACTIVE.
11. B: `GET /families/my` → thấy family. B gọi lại bước 6 → 409 `Bạn đã là thành viên của gia đình này`.
12. A: `POST /families/{familyId}/invite-code/regenerate` lần 2 → mã mới; `GET /invite-codes/{mã cũ}` → 404.

Expected: đúng như từng dòng trên. Sai ở đâu → sửa (dùng superpowers:systematic-debugging), KHÔNG bỏ qua.

- [ ] **Step 3: Commit fix (nếu có) + dừng dev server**

```bash
git add -A server
git commit -m "fix: smoke test findings for invite code flow"   # chỉ khi có fix
```
