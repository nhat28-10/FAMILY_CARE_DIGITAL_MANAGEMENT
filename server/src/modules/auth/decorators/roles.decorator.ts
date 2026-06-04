import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the given roles. Used together with RolesGuard.
 *
 * @example
 * @Roles(Role.ADMIN)
 * @Roles(Role.ADMIN, Role.FAMILY_MANAGER)
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
