import { Role } from '@prisma/client';

/**
 * Claims embedded in both the access and refresh JWTs.
 */
export interface JwtPayload {
  /** Subject — the user id. */
  sub: string;
  email: string;
  role: Role;
}
