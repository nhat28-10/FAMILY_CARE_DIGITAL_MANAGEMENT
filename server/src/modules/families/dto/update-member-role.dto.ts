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
