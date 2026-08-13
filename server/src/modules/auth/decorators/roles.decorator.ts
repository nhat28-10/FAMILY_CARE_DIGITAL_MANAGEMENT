import { SetMetadata } from '@nestjs/common';
import { UserType } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the given account user types. Used with RolesGuard.
 *
 * @example
 * @Roles(UserType.SYSTEM_ADMIN)
 */
export const Roles = (...roles: UserType[]) => SetMetadata(ROLES_KEY, roles);
