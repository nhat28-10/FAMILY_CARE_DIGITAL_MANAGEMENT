import { User } from '@prisma/client';

/**
 * User representation that is safe to return over the API: it never contains
 * the password hash or the refresh-token hash.
 */
export type SafeUser = Omit<User, 'passwordHash' | 'refreshTokenHash'>;

/**
 * Strips all sensitive fields from a User record.
 */
export function sanitizeUser(user: User): SafeUser {
  // Intentionally destructure-and-drop the sensitive fields.
  const { passwordHash: _passwordHash, refreshTokenHash: _refreshTokenHash, ...safe } =
    user;
  return safe;
}
