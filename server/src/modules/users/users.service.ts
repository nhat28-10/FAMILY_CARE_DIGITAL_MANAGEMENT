import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Data-access layer for the User aggregate. Returns raw User records
 * (including hashes) for internal use by the auth layer — callers are
 * responsible for sanitizing before sending data to clients.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Persists the hash of the latest refresh token (token rotation).
   */
  setRefreshTokenHash(id: string, refreshTokenHash: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { refreshTokenHash },
    });
  }

  /**
   * Clears the stored refresh-token hash, effectively logging the user out
   * of every device using a refresh token.
   */
  clearRefreshToken(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { refreshTokenHash: null },
    });
  }
}
