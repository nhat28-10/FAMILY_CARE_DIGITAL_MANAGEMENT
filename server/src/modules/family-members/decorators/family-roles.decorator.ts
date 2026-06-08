import { SetMetadata } from '@nestjs/common';
import { FamilyRole } from '@prisma/client';

export const FAMILY_ROLES_KEY = 'family_roles';

/**
 * Restricts a route to members holding one of the given family roles. Used
 * together with FamilyPermissionGuard (which also enforces membership).
 *
 * @example
 * @UseGuards(JwtAuthGuard, FamilyPermissionGuard)
 * @FamilyRoles(FamilyRole.MANAGER)
 */
export const FamilyRoles = (...roles: FamilyRole[]) =>
  SetMetadata(FAMILY_ROLES_KEY, roles);
