import { SetMetadata } from '@nestjs/common';
import { SystemRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the given system roles. Used together with RolesGuard.
 *
 * @example
 * @Roles(SystemRole.ADMIN)
 * @Roles(SystemRole.ADMIN, SystemRole.FAMILY_MANAGER)
 */
export const Roles = (...roles: SystemRole[]) => SetMetadata(ROLES_KEY, roles);
