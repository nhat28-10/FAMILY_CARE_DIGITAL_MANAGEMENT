# Family Role Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép FAMILY_MANAGER đổi vai trò thành viên sau khi họ đã vào nhóm — bổ nhiệm/gỡ phó nhóm (đổi role thường) và trao quyền trưởng nhóm (transfer ownership) — theo mô hình Zalo.

**Architecture:** Thêm 2 endpoint vào module `families` hiện có (nơi đã có `removeMember`). Mỗi endpoint gồm 1 DTO + 1 method trong `FamiliesService` + 1 route trong `FamiliesController`. Giới hạn số phó nhóm đọc từ config. Notification tái dùng `NotificationsService.notify` (gọi sau khi DB đổi, bọc try/catch). Transfer ownership swap role trong 1 transaction để giữ invariant "đúng 1 trưởng nhóm".

**Tech Stack:** NestJS 11, Prisma, class-validator, Jest.

## Global Constraints

- Message trả client là **tiếng Việt** (cả success lẫn error).
- Route prefix `/api/v1` (đã set global ở `main.ts`).
- Controller **chỉ `return` data** — không tự bọc `{ success, ... }`.
- Phân quyền: `@UseGuards(JwtAuthGuard, FamilyPermissionGuard)` + `@FamilyRoles(FamilyRole.FAMILY_MANAGER)`; route phải có param `:familyId`.
- PK mọi model là field `id`; FK dạng `<entity>Id`.
- Type chỉ-là-type dùng trong tham số có decorator phải `import type`.
- Không trả `passwordHash`; các API member đã dùng `user` select giới hạn field.
- Invariant: nhóm luôn có **đúng 1** `FAMILY_MANAGER`; số `DEPUTY_MEMBER` ACTIVE ≤ `FAMILY_MAX_DEPUTIES` (mặc định 2).

---

### Task 1: Đổi vai trò thường (bổ nhiệm / gỡ phó nhóm)

**Files:**
- Modify: `server/src/config/configuration.ts` — thêm khối `family.maxDeputies`
- Create: `server/src/modules/families/dto/update-member-role.dto.ts`
- Modify: `server/src/modules/families/families.service.ts` — inject `ConfigService`, thêm method `changeMemberRole`
- Modify: `server/src/modules/families/families.controller.ts` — thêm route `PATCH :familyId/members/:userId/role`
- Test: `server/src/modules/families/families.service.spec.ts` — cập nhật constructor + thêm `describe('changeMemberRole')`

**Interfaces:**
- Consumes: `FamiliesService` constructor hiện có (5 tham số); `FamilyMembersService.findByFamilyAndUser(familyId, userId) => Promise<FamilyMember | null>`; `NotificationsService.notify(familyId, recipientMemberIds: string[], input: CreateNotificationInput) => Promise<{ ids }>`.
- Produces: `FamiliesService.changeMemberRole(familyId: string, targetUserId: string, familyRole: FamilyRole) => Promise<FamilyMember>`; DTO `UpdateMemberRoleDto { familyRole: FamilyRole }`; config path `family.maxDeputies: number`.

- [ ] **Step 1: Thêm config `family.maxDeputies`**

Trong `server/src/config/configuration.ts`, thêm khối sau vào object trả về (đặt sau khối `throttle` cho gọn):

```ts
  family: {
    maxDeputies: parseInt(process.env.FAMILY_MAX_DEPUTIES || '2', 10),
  },
```

- [ ] **Step 2: Tạo DTO `UpdateMemberRoleDto`**

Tạo `server/src/modules/families/dto/update-member-role.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { FamilyRole } from '@prisma/client';
import { IsIn } from 'class-validator';

/**
 * Manager đổi vai trò thành viên (chỉ giữa DEPUTY_MEMBER và FAMILY_MEMBER).
 * Không cho set FAMILY_MANAGER qua đây — dùng transfer-ownership.
 */
export class UpdateMemberRoleDto {
  @ApiProperty({ enum: [FamilyRole.DEPUTY_MEMBER, FamilyRole.FAMILY_MEMBER] })
  @IsIn([FamilyRole.DEPUTY_MEMBER, FamilyRole.FAMILY_MEMBER])
  familyRole: FamilyRole;
}
```

- [ ] **Step 3: Inject `ConfigService` vào `FamiliesService` (cập nhật spec constructor trước — test đỏ)**

Trong `server/src/modules/families/families.service.spec.ts`, thêm import và mock config, sửa cả 2 lời gọi `new FamiliesService(...)` để có tham số thứ 6. Ở đầu file thêm import:

```ts
import { ConfigService } from '@nestjs/config';
```

Trong `beforeEach`, thêm biến mock trước dòng `service = new FamiliesService(`:

```ts
    const config = { get: jest.fn().mockReturnValue(2) };
```

Và sửa lời gọi khởi tạo service thành:

```ts
    service = new FamiliesService(
      prisma as unknown as PrismaService,
      familyMembers as unknown as FamilyMembersService,
      sosGateway as unknown as SosGateway,
      {} as unknown as SubscriptionsService,
      notifications as unknown as NotificationsService,
      config as unknown as ConfigService,
    );
```

- [ ] **Step 4: Chạy test để xác nhận đỏ (compile fail do constructor thiếu tham số)**

Run: `cd server && npx jest families.service.spec --silent`
Expected: FAIL — TypeScript báo `FamiliesService` constructor nhận 5 tham số (chưa có tham số thứ 6) HOẶC test lỗi biên dịch.

- [ ] **Step 5: Thêm `ConfigService` vào constructor `FamiliesService`**

Trong `server/src/modules/families/families.service.ts`, thêm import:

```ts
import { ConfigService } from '@nestjs/config';
```

Thêm tham số vào constructor (sau `notificationsService`):

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly familyMembersService: FamilyMembersService,
    private readonly sosGateway: SosGateway,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}
```

- [ ] **Step 6: Chạy lại test cũ để xác nhận xanh trở lại**

Run: `cd server && npx jest families.service.spec --silent`
Expected: PASS — các test `removeMember` cũ chạy lại bình thường.

- [ ] **Step 7: Viết test đỏ cho `changeMemberRole`**

Thêm vào cuối `server/src/modules/families/families.service.spec.ts` một `describe` mới. Mock `prisma.familyMember` cần thêm `count` và `update`:

```ts
describe('FamiliesService.changeMemberRole', () => {
  const familyId = 'family-id';
  const targetUserId = 'target-user-id';
  const targetMemberId = 'target-member-id';
  let prisma: { familyMember: Record<string, jest.Mock> };
  let familyMembers: { findByFamilyAndUser: jest.Mock };
  let notifications: { notify: jest.Mock };
  let config: { get: jest.Mock };
  let service: FamiliesService;

  beforeEach(() => {
    prisma = {
      familyMember: {
        count: jest.fn().mockResolvedValue(0),
        update: jest
          .fn()
          .mockResolvedValue({ id: targetMemberId, familyRole: FamilyRole.DEPUTY_MEMBER }),
      },
    };
    familyMembers = { findByFamilyAndUser: jest.fn() };
    notifications = { notify: jest.fn().mockResolvedValue({ ids: [] }) };
    config = { get: jest.fn().mockReturnValue(2) };
    service = new FamiliesService(
      prisma as unknown as PrismaService,
      familyMembers as unknown as FamilyMembersService,
      {} as unknown as SosGateway,
      {} as unknown as SubscriptionsService,
      notifications as unknown as NotificationsService,
      config as unknown as ConfigService,
    );
  });

  it('promotes an ACTIVE FAMILY_MEMBER to DEPUTY_MEMBER and notifies them', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      id: targetMemberId,
      familyRole: FamilyRole.FAMILY_MEMBER,
      status: MemberStatus.ACTIVE,
    });

    await service.changeMemberRole(
      familyId,
      targetUserId,
      FamilyRole.DEPUTY_MEMBER,
    );

    expect(prisma.familyMember.update).toHaveBeenCalledWith({
      where: { familyId_userId: { familyId, userId: targetUserId } },
      data: { familyRole: FamilyRole.DEPUTY_MEMBER },
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      familyId,
      [targetMemberId],
      expect.objectContaining({
        type: NotificationType.MEMBER,
        referenceType: 'FAMILY_MEMBER',
        referenceId: targetMemberId,
      }),
    );
  });

  it('throws BadRequest when deputy cap is reached', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      id: targetMemberId,
      familyRole: FamilyRole.FAMILY_MEMBER,
      status: MemberStatus.ACTIVE,
    });
    prisma.familyMember.count.mockResolvedValue(2);

    await expect(
      service.changeMemberRole(familyId, targetUserId, FamilyRole.DEPUTY_MEMBER),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.familyMember.update).not.toHaveBeenCalled();
  });

  it('throws BadRequest when target is the FAMILY_MANAGER', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      id: targetMemberId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });

    await expect(
      service.changeMemberRole(familyId, targetUserId, FamilyRole.DEPUTY_MEMBER),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.familyMember.update).not.toHaveBeenCalled();
  });

  it('throws NotFound when target is missing or not ACTIVE', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue(null);

    await expect(
      service.changeMemberRole(familyId, targetUserId, FamilyRole.DEPUTY_MEMBER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is idempotent when the member already has the target role', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      id: targetMemberId,
      familyRole: FamilyRole.DEPUTY_MEMBER,
      status: MemberStatus.ACTIVE,
    });

    await service.changeMemberRole(
      familyId,
      targetUserId,
      FamilyRole.DEPUTY_MEMBER,
    );

    expect(prisma.familyMember.update).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Chạy test để xác nhận đỏ**

Run: `cd server && npx jest families.service.spec --silent`
Expected: FAIL — `service.changeMemberRole is not a function`.

- [ ] **Step 9: Implement `changeMemberRole` trong `FamiliesService`**

Thêm method vào `server/src/modules/families/families.service.ts` (đặt cạnh `removeMember`). Đảm bảo `FamilyRole`, `MemberStatus`, `NotificationType`, `NotificationPriority` đã có trong import `@prisma/client` (đã có sẵn):

```ts
  /**
   * Đổi vai trò một thành viên (bổ nhiệm/gỡ phó nhóm). Chỉ giữa DEPUTY_MEMBER
   * và FAMILY_MEMBER — không đụng FAMILY_MANAGER (dùng transferOwnership).
   * Idempotent nếu role không đổi. Ràng buộc số phó nhóm theo config.
   */
  async changeMemberRole(
    familyId: string,
    targetUserId: string,
    familyRole: FamilyRole,
  ): Promise<FamilyMember> {
    const target = await this.familyMembersService.findByFamilyAndUser(
      familyId,
      targetUserId,
    );
    if (!target || target.status !== MemberStatus.ACTIVE) {
      throw new NotFoundException(
        'Không tìm thấy thành viên trong gia đình này',
      );
    }
    if (target.familyRole === FamilyRole.FAMILY_MANAGER) {
      throw new BadRequestException(
        'Không thể đổi vai trò của quản lý gia đình',
      );
    }
    if (target.familyRole === familyRole) {
      return target;
    }
    if (familyRole === FamilyRole.DEPUTY_MEMBER) {
      const deputyCount = await this.prisma.familyMember.count({
        where: {
          familyId,
          status: MemberStatus.ACTIVE,
          familyRole: FamilyRole.DEPUTY_MEMBER,
        },
      });
      const maxDeputies = this.config.get<number>('family.maxDeputies') ?? 2;
      if (deputyCount >= maxDeputies) {
        throw new BadRequestException('Đã đạt số phó nhóm tối đa');
      }
    }

    const updated = await this.prisma.familyMember.update({
      where: { familyId_userId: { familyId, userId: targetUserId } },
      data: { familyRole },
    });

    // Thao tác đổi role đã thành công — lỗi thông báo không được biến thành 5xx.
    try {
      const promoted = familyRole === FamilyRole.DEPUTY_MEMBER;
      await this.notificationsService.notify(familyId, [updated.id], {
        type: NotificationType.MEMBER,
        priority: NotificationPriority.NORMAL,
        title: promoted
          ? 'Bạn được bổ nhiệm làm phó nhóm'
          : 'Vai trò của bạn đã thay đổi',
        body: promoted
          ? 'Bạn đã được bổ nhiệm làm phó nhóm trong gia đình.'
          : 'Vai trò của bạn trong gia đình đã được cập nhật thành thành viên.',
        referenceType: 'FAMILY_MEMBER',
        referenceId: updated.id,
      });
    } catch (err) {
      this.logger.error(
        `Không thể gửi thông báo đổi vai trò: ${(err as Error).message}`,
      );
    }

    return updated;
  }
```

Thêm `FamilyMember` vào import `@prisma/client` ở đầu file nếu chưa có.

- [ ] **Step 10: Chạy test để xác nhận xanh**

Run: `cd server && npx jest families.service.spec --silent`
Expected: PASS — tất cả test `changeMemberRole` + `removeMember` xanh.

- [ ] **Step 11: Thêm route controller `PATCH :familyId/members/:userId/role`**

Trong `server/src/modules/families/families.controller.ts`, thêm import DTO:

```ts
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
```

Thêm route (đặt trước `removeMember`):

```ts
  @Patch(':familyId/members/:userId/role')
  @UseGuards(FamilyPermissionGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @ResponseMessage('Cập nhật vai trò thành viên thành công')
  @ApiOperation({
    summary: 'Bổ nhiệm/gỡ phó nhóm (FAMILY_MANAGER only)',
  })
  @ApiResponse({ status: 400, description: 'Vượt giới hạn phó nhóm hoặc đổi vai trò quản lý' })
  @ApiResponse({ status: 403, description: 'Requires family MANAGER role' })
  @ApiResponse({ status: 404, description: 'Member not found in this family' })
  changeMemberRole(
    @Param('familyId') familyId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.familiesService.changeMemberRole(
      familyId,
      userId,
      dto.familyRole,
    );
  }
```

- [ ] **Step 12: Build kiểm tra TypeScript**

Run: `cd server && npx tsc --noEmit`
Expected: Không lỗi.

- [ ] **Step 13: Commit**

```bash
git add server/src/config/configuration.ts server/src/modules/families/dto/update-member-role.dto.ts server/src/modules/families/families.service.ts server/src/modules/families/families.controller.ts server/src/modules/families/families.service.spec.ts
git commit -m "feat(families): đổi vai trò thành viên (bổ nhiệm/gỡ phó nhóm)"
```

---

### Task 2: Trao quyền trưởng nhóm (transfer ownership)

**Files:**
- Create: `server/src/modules/families/dto/transfer-ownership.dto.ts`
- Modify: `server/src/modules/families/families.service.ts` — thêm method `transferOwnership`
- Modify: `server/src/modules/families/families.controller.ts` — thêm route `POST :familyId/transfer-ownership`
- Test: `server/src/modules/families/families.service.spec.ts` — thêm `describe('transferOwnership')`

**Interfaces:**
- Consumes: `FamiliesService` constructor 6 tham số (từ Task 1); `FamilyMembersService.findByFamilyAndUser`; `NotificationsService.notify`; `FamiliesService.getById(familyId) => Promise<Family & { members }>`.
- Produces: `FamiliesService.transferOwnership(familyId: string, currentManagerUserId: string, targetUserId: string) => Promise<Family & { members }>`; DTO `TransferOwnershipDto { targetUserId: string; confirm: boolean }`.

- [ ] **Step 1: Tạo DTO `TransferOwnershipDto`**

Tạo `server/src/modules/families/dto/transfer-ownership.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsUUID } from 'class-validator';

/**
 * Trao quyền trưởng nhóm cho một thành viên khác. `confirm` phải là true
 * để tránh trao nhầm (UI hiển thị dialog cảnh báo trước khi gửi).
 */
export class TransferOwnershipDto {
  @ApiProperty({ description: 'userId của thành viên nhận quyền trưởng nhóm' })
  @IsUUID()
  targetUserId: string;

  @ApiProperty({ description: 'Phải là true để xác nhận trao quyền' })
  @IsBoolean()
  @Equals(true)
  confirm: boolean;
}
```

- [ ] **Step 2: Viết test đỏ cho `transferOwnership`**

Thêm `describe` mới vào cuối `server/src/modules/families/families.service.spec.ts`:

```ts
describe('FamiliesService.transferOwnership', () => {
  const familyId = 'family-id';
  const managerUserId = 'manager-user-id';
  const targetUserId = 'target-user-id';
  const newManagerMemberId = 'new-manager-member-id';
  const oldManagerMemberId = 'old-manager-member-id';
  let prisma: {
    familyMember: Record<string, jest.Mock>;
    family: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let familyMembers: { findByFamilyAndUser: jest.Mock };
  let notifications: { notify: jest.Mock };
  let service: FamiliesService;

  beforeEach(() => {
    prisma = {
      familyMember: { update: jest.fn() },
      family: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: familyId, members: [] }),
      },
      $transaction: jest
        .fn()
        .mockResolvedValue([
          { id: newManagerMemberId },
          { id: oldManagerMemberId },
        ]),
    };
    familyMembers = { findByFamilyAndUser: jest.fn() };
    notifications = { notify: jest.fn().mockResolvedValue({ ids: [] }) };
    service = new FamiliesService(
      prisma as unknown as PrismaService,
      familyMembers as unknown as FamilyMembersService,
      {} as unknown as SosGateway,
      {} as unknown as SubscriptionsService,
      notifications as unknown as NotificationsService,
      { get: jest.fn() } as unknown as ConfigService,
    );
  });

  it('swaps roles atomically and notifies both parties', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      id: newManagerMemberId,
      familyRole: FamilyRole.FAMILY_MEMBER,
      status: MemberStatus.ACTIVE,
    });

    await service.transferOwnership(familyId, managerUserId, targetUserId);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith(
      familyId,
      [newManagerMemberId],
      expect.objectContaining({ type: NotificationType.MEMBER }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      familyId,
      [oldManagerMemberId],
      expect.objectContaining({ type: NotificationType.MEMBER }),
    );
  });

  it('throws BadRequest when transferring to self', async () => {
    await expect(
      service.transferOwnership(familyId, managerUserId, managerUserId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws NotFound when target is missing or not ACTIVE', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue(null);

    await expect(
      service.transferOwnership(familyId, managerUserId, targetUserId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Chạy test để xác nhận đỏ**

Run: `cd server && npx jest families.service.spec --silent`
Expected: FAIL — `service.transferOwnership is not a function`.

- [ ] **Step 4: Implement `transferOwnership` trong `FamiliesService`**

Thêm method vào `server/src/modules/families/families.service.ts` (cạnh `changeMemberRole`):

```ts
  /**
   * Trao quyền trưởng nhóm: target lên FAMILY_MANAGER, manager cũ tụt xuống
   * FAMILY_MEMBER. Swap trong 1 transaction để không bao giờ rơi vào trạng
   * thái 0 hoặc 2 trưởng nhóm. Manager cũ KHÔNG tính vào giới hạn phó nhóm.
   */
  async transferOwnership(
    familyId: string,
    currentManagerUserId: string,
    targetUserId: string,
  ) {
    if (targetUserId === currentManagerUserId) {
      throw new BadRequestException('Không thể trao quyền cho chính mình');
    }
    const target = await this.familyMembersService.findByFamilyAndUser(
      familyId,
      targetUserId,
    );
    if (!target || target.status !== MemberStatus.ACTIVE) {
      throw new NotFoundException(
        'Không tìm thấy thành viên trong gia đình này',
      );
    }

    const [newManager, oldManager] = await this.prisma.$transaction([
      this.prisma.familyMember.update({
        where: { familyId_userId: { familyId, userId: targetUserId } },
        data: { familyRole: FamilyRole.FAMILY_MANAGER },
      }),
      this.prisma.familyMember.update({
        where: {
          familyId_userId: { familyId, userId: currentManagerUserId },
        },
        data: { familyRole: FamilyRole.FAMILY_MEMBER },
      }),
    ]);

    // Role đã swap thành công — lỗi thông báo không được biến thành 5xx.
    try {
      await this.notificationsService.notify(familyId, [newManager.id], {
        type: NotificationType.MEMBER,
        priority: NotificationPriority.NORMAL,
        title: 'Bạn đã trở thành trưởng nhóm',
        body: 'Bạn đã được trao quyền trưởng nhóm gia đình.',
        referenceType: 'FAMILY_MEMBER',
        referenceId: newManager.id,
      });
      await this.notificationsService.notify(familyId, [oldManager.id], {
        type: NotificationType.MEMBER,
        priority: NotificationPriority.NORMAL,
        title: 'Bạn đã trao quyền trưởng nhóm',
        body: 'Bạn đã trao quyền trưởng nhóm cho thành viên khác.',
        referenceType: 'FAMILY_MEMBER',
        referenceId: oldManager.id,
      });
    } catch (err) {
      this.logger.error(
        `Không thể gửi thông báo trao quyền: ${(err as Error).message}`,
      );
    }

    return this.getById(familyId);
  }
```

- [ ] **Step 5: Chạy test để xác nhận xanh**

Run: `cd server && npx jest families.service.spec --silent`
Expected: PASS — tất cả test trong file xanh.

- [ ] **Step 6: Thêm route controller `POST :familyId/transfer-ownership`**

Trong `server/src/modules/families/families.controller.ts`, thêm import DTO:

```ts
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
```

Thêm route (đặt sau `changeMemberRole`, trước `removeMember`):

```ts
  @Post(':familyId/transfer-ownership')
  @UseGuards(FamilyPermissionGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Trao quyền trưởng nhóm thành công')
  @ApiOperation({
    summary: 'Trao quyền trưởng nhóm cho thành viên khác (FAMILY_MANAGER only)',
  })
  @ApiResponse({ status: 400, description: 'Trao cho chính mình hoặc thiếu xác nhận' })
  @ApiResponse({ status: 403, description: 'Requires family MANAGER role' })
  @ApiResponse({ status: 404, description: 'Member not found in this family' })
  transferOwnership(
    @Param('familyId') familyId: string,
    @CurrentUser('id') currentUserId: string,
    @Body() dto: TransferOwnershipDto,
  ) {
    return this.familiesService.transferOwnership(
      familyId,
      currentUserId,
      dto.targetUserId,
    );
  }
```

`CurrentUser` và `Post`, `HttpCode`, `HttpStatus` đã được import sẵn trong file — kiểm tra lại, nếu thiếu thì bổ sung.

- [ ] **Step 7: Build kiểm tra TypeScript**

Run: `cd server && npx tsc --noEmit`
Expected: Không lỗi.

- [ ] **Step 8: Chạy toàn bộ test module families lần cuối**

Run: `cd server && npx jest families --silent`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add server/src/modules/families/dto/transfer-ownership.dto.ts server/src/modules/families/families.service.ts server/src/modules/families/families.controller.ts server/src/modules/families/families.service.spec.ts
git commit -m "feat(families): trao quyền trưởng nhóm (transfer ownership)"
```

---

## Self-Review

**Spec coverage:**
- Config `FAMILY_MAX_DEPUTIES` → Task 1 Step 1. ✅
- Endpoint đổi role thường + invariant (404/400 manager/idempotent/deputy cap/notify) → Task 1 Steps 2-13. ✅
- Endpoint transfer ownership (atomic swap, self-check, confirm, notify cả hai) → Task 2. ✅
- Notification tái dùng `notify`, gọi sau DB, try/catch → Task 1 Step 9, Task 2 Step 4. ✅
- Test theo pattern spec sẵn có → Task 1 Step 7, Task 2 Step 2. ✅
- Ngoài phạm vi (admin PATCH, deputy guard, audit log) → không có task, đúng chủ ý. ✅

**Placeholder scan:** Không có TBD/TODO; mọi step có code/lệnh cụ thể. ✅

**Type consistency:** `changeMemberRole(familyId, targetUserId, familyRole)` và `transferOwnership(familyId, currentManagerUserId, targetUserId)` khớp giữa controller ↔ service ↔ test. DTO `UpdateMemberRoleDto.familyRole`, `TransferOwnershipDto.{targetUserId,confirm}` khớp controller. Constructor 6 tham số nhất quán ở mọi `new FamiliesService(...)`. `notify(familyId, memberIds[], input)` khớp chữ ký thật. ✅
