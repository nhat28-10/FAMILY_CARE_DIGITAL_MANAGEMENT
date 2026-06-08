import { User } from '@prisma/client';

/**
 * User representation that is safe to return over the API: it never contains
 * the password hash. (Refresh tokens live in their own table, not on User.)
 */
export type SafeUser = Omit<User, 'passwordHash'>;

/**
 * Strips all sensitive fields from a User record.
 */
export function sanitizeUser(user: User): SafeUser {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}
