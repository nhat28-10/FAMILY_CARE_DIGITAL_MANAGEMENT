import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Manages persisted refresh tokens (table `refresh_tokens`). One row per
 * session/device. The raw token (the signed refresh JWT) is never stored —
 * only its bcrypt hash — so a DB leak cannot be replayed. Each row id is used
 * as the JWT `jti` claim, enabling rotation and per-session revocation.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Stores a new refresh-token row under the given id (used as the JWT `jti`).
   */
  async store(
    id: string,
    userId: string,
    rawToken: string,
    expiresAt: Date,
  ): Promise<void> {
    const tokenHash = await bcrypt.hash(rawToken, this.saltRounds);
    await this.prisma.refreshToken.create({
      data: { id, userId, tokenHash, expiresAt },
    });
  }

  /**
   * Returns true only if the token row exists, belongs to the user, is not
   * revoked, not expired, and the raw token matches the stored hash.
   */
  async isValid(
    id: string,
    userId: string,
    rawToken: string,
  ): Promise<boolean> {
    const row = await this.prisma.refreshToken.findUnique({ where: { id } });
    if (
      !row ||
      row.userId !== userId ||
      row.revokedAt !== null ||
      row.expiresAt.getTime() <= Date.now()
    ) {
      return false;
    }
    return bcrypt.compare(rawToken, row.tokenHash);
  }

  /** Revokes a single session (idempotent). */
  async revoke(id: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every active session of a user (logout everywhere). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private get saltRounds(): number {
    return this.config.get<number>('bcrypt.saltRounds', 10);
  }
}
