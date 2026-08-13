# Thiết kế: Quản lý vai trò thành viên gia đình (theo mô hình Zalo)

- **Ngày**: 2026-07-23
- **Module**: `server/src/modules/families`
- **Mục tiêu**: Cho phép **FAMILY_MANAGER** đổi vai trò thành viên **sau khi họ đã vào
  nhóm**, theo đúng mô hình nhóm Zalo (bổ nhiệm/gỡ phó nhóm tách biệt khỏi trao quyền
  trưởng nhóm).

## 1. Bối cảnh & vấn đề

Hiện tại vai trò `familyRole` chỉ được set ở 2 chỗ:

1. Lúc duyệt join request — `join-requests.service.ts` (`ApproveJoinRequestDto.familyRole`,
   mặc định `FAMILY_MEMBER`). Đây là lần duy nhất manager chọn role trong luồng gia đình.
2. Qua admin hệ thống — `PATCH /api/v1/admin/family-members/:id` (yêu cầu `SYSTEM_ADMIN`).

→ **Lỗ hổng**: sau khi thành viên đã vào nhóm, **FAMILY_MANAGER không có cách nào** đổi vai
trò của họ (nâng `FAMILY_MEMBER` lên `DEPUTY_MEMBER`, hạ xuống, hay trao quyền trưởng nhóm).
Chỉ SYSTEM_ADMIN mới làm được — không đúng thực tế (admin nền tảng không nên đụng nội bộ
từng gia đình).

Ánh xạ với model hiện có: `FAMILY_MANAGER` = trưởng nhóm, `DEPUTY_MEMBER` = phó nhóm,
`FAMILY_MEMBER` = thành viên thường.

## 2. Quyết định thiết kế (đã chốt)

| Vấn đề | Quyết định |
|--------|-----------|
| Giới hạn số phó nhóm | Hằng số config `FAMILY_MAX_DEPUTIES`, mặc định **2** |
| Trao quyền: trưởng cũ tụt xuống | **FAMILY_MEMBER** (giống Zalo) |
| Trao quyền: xác nhận | **Chỉ confirm thường** (cờ `confirm=true`), không nhập lại mật khẩu |
| Ghi vết | **Không** audit log — chỉ `notification` cho người bị đổi |
| Ai được đổi role | **Chỉ FAMILY_MANAGER** (phó nhóm không tự bổ nhiệm/nâng mình) |
| Kiến trúc | **2 endpoint tách biệt**: đổi role thường ≠ trao quyền owner |

## 3. Invariant BẮT BUỘC (enforce ở service, không tin UI)

- Nhóm **luôn có đúng 1** `FAMILY_MANAGER`. Không cho có 0 hoặc 2 manager tại bất kỳ thời điểm.
- Không set/gỡ `FAMILY_MANAGER` qua endpoint đổi role thường — muốn đổi manager **phải** dùng
  transfer-ownership.
- Số `DEPUTY_MEMBER` ACTIVE ≤ `FAMILY_MAX_DEPUTIES`.
- Mọi thao tác chỉ tác động lên member **ACTIVE** của đúng family đó.

## 4. Thiết kế chi tiết

### 4.1 Config

Thêm vào `server/src/config/configuration.ts`:

```ts
family: {
  maxDeputies: parseInt(process.env.FAMILY_MAX_DEPUTIES || '2', 10),
},
```

Đọc qua `ConfigService` trong `FamiliesService` (`this.config.get<number>('family.maxDeputies')`).
Cần inject `ConfigService` vào `FamiliesService` nếu chưa có.

### 4.2 Endpoint A — Đổi vai trò thường (bổ nhiệm / gỡ phó nhóm)

```
PATCH /api/v1/families/:familyId/members/:userId/role
Guards: JwtAuthGuard, FamilyPermissionGuard
@FamilyRoles(FamilyRole.FAMILY_MANAGER)
@ResponseMessage('Cập nhật vai trò thành viên thành công')
Body: UpdateMemberRoleDto { familyRole }
```

**DTO `UpdateMemberRoleDto`** (`families/dto/update-member-role.dto.ts`):

```ts
export class UpdateMemberRoleDto {
  @ApiProperty({ enum: [FamilyRole.DEPUTY_MEMBER, FamilyRole.FAMILY_MEMBER] })
  @IsIn([FamilyRole.DEPUTY_MEMBER, FamilyRole.FAMILY_MEMBER])
  familyRole: FamilyRole;
}
```

`@IsIn` chặn set `FAMILY_MANAGER` ngay tầng validation (400).

**Service `changeMemberRole(familyId, targetUserId, familyRole)`**:

1. Tìm target qua `familyMembersService.findByFamilyAndUser`. Không có / không ACTIVE
   → `NotFoundException('Không tìm thấy thành viên trong gia đình này')`.
2. Nếu `target.familyRole === FAMILY_MANAGER` →
   `BadRequestException('Không thể đổi vai trò của quản lý gia đình')`.
3. Nếu `target.familyRole === familyRole` (trùng) → idempotent, trả về member hiện tại,
   không đổi, không notify.
4. Nếu nâng lên `DEPUTY_MEMBER`: đếm số `DEPUTY_MEMBER` ACTIVE trong family; nếu
   `>= maxDeputies` → `BadRequestException('Đã đạt số phó nhóm tối đa')`.
5. `prisma.familyMember.update` set `familyRole` mới.
6. Sau update: `notificationsService.notify` cho **chính người bị đổi** (persist), bọc
   try/catch để lỗi noti không làm hỏng thao tác đã thành công. Nội dung:
   - Nâng phó: "Bạn được bổ nhiệm làm phó nhóm".
   - Hạ về thành viên: "Vai trò của bạn trong gia đình đã thay đổi".
   - `type: NotificationType.MEMBER`, `referenceType: 'FAMILY_MEMBER'`,
     `referenceId: <member.id>`.
7. Trả về member đã cập nhật (kèm `user` select như các API khác).

### 4.3 Endpoint B — Trao quyền trưởng nhóm (transfer ownership)

```
POST /api/v1/families/:familyId/transfer-ownership
Guards: JwtAuthGuard, FamilyPermissionGuard
@FamilyRoles(FamilyRole.FAMILY_MANAGER)
@HttpCode(HttpStatus.OK)
@ResponseMessage('Trao quyền trưởng nhóm thành công')
Body: TransferOwnershipDto { targetUserId, confirm }
```

Lấy manager hiện tại qua `@CurrentUser('id')` (caller — đã được guard đảm bảo là MANAGER).

**DTO `TransferOwnershipDto`** (`families/dto/transfer-ownership.dto.ts`):

```ts
export class TransferOwnershipDto {
  @ApiProperty()
  @IsUUID()
  targetUserId: string;

  @ApiProperty({ description: 'Phải là true để xác nhận trao quyền' })
  @IsBoolean()
  @Equals(true)
  confirm: boolean;
}
```

**Service `transferOwnership(familyId, currentManagerUserId, targetUserId)`**:

1. Nếu `targetUserId === currentManagerUserId` →
   `BadRequestException('Không thể trao quyền cho chính mình')`.
2. Tìm target qua `findByFamilyAndUser`. Không có / không ACTIVE →
   `NotFoundException('Không tìm thấy thành viên trong gia đình này')`.
3. **Transaction** (atomic — tránh trạng thái 0 hoặc 2 manager):
   - Update target → `familyRole = FAMILY_MANAGER`.
   - Update manager cũ → `familyRole = FAMILY_MEMBER`.
4. Sau commit: `notificationsService.notify` (bọc try/catch):
   - Target: "Bạn đã trở thành trưởng nhóm".
   - Manager cũ: "Bạn đã trao quyền trưởng nhóm".
   - `type: NotificationType.MEMBER`, `referenceType: 'FAMILY_MEMBER'`.
5. Trả về danh sách member gia đình đã cập nhật (hoặc family kèm members) để client refresh.

> Lưu ý: manager cũ tụt xuống `FAMILY_MEMBER` **không** đụng giới hạn `maxDeputies`
> (không thành phó). Target lên MANAGER cũng không tính vào cap phó.

### 4.4 Controller

Thêm 2 route vào `families/families.controller.ts` (nơi đã có `removeMember`), kèm
`@ApiOperation`, `@ApiResponse` cho các mã 400/403/404. Controller **chỉ `return`** data;
envelope do interceptor bọc.

## 5. Notification

Tái dùng `NotificationsService.notify` (persist + dispatch, gọi **sau** khi DB thay đổi,
bọc try/catch). Không dùng nhánh `{ tx }` vì thao tác đổi role không đòi hỏi persist noti
bên trong transaction. Theo đúng pattern của `removeMember`.

## 6. Test

Unit test trong `families/families.service.spec.ts` theo pattern sẵn có (mock `PrismaService`,
`FamilyMembersService`, `NotificationsService`):

- `changeMemberRole`: nâng phó thành công; chặn khi vượt `maxDeputies`; chặn đổi role
  MANAGER; 404 khi target không ACTIVE/không tồn tại; idempotent khi trùng role; validation
  `@IsIn` chặn MANAGER (test ở tầng DTO nếu có).
- `transferOwnership`: hoán đổi role atomic đúng; chặn trao cho chính mình; 404 target không
  hợp lệ; đảm bảo manager cũ về `FAMILY_MEMBER` và target lên `FAMILY_MANAGER`.

## 7. Ngoài phạm vi (YAGNI)

- Giữ nguyên `admin/family-members` PATCH (SYSTEM_ADMIN xử lý khiếu nại) — không sửa.
- Không đổi quyền/guard của `DEPUTY_MEMBER` ở các module khác.
- Không audit log (ghi chú là hướng mở rộng tương lai).
- Không có luồng "manager rời nhóm" mới — `removeMember` hiện đã chặn xóa MANAGER; nếu manager
  muốn rời phải trao quyền trước (đúng invariant Zalo), nhưng endpoint "rời nhóm" nằm ngoài
  phạm vi spec này.
