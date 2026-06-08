import { SystemRole } from '@prisma/client';

/**
 * Claims embedded in the JWTs.
 * - Access token: { sub, email, systemRole }
 * - Refresh token: same + `jti` (id of the refresh_tokens row) for rotation.
 */
export interface JwtPayload {
  /** Subject — the user id. */
  sub: string;
  email: string;
  systemRole: SystemRole;
  /** Refresh-token row id; only present on refresh tokens. */
  jti?: string;
}
