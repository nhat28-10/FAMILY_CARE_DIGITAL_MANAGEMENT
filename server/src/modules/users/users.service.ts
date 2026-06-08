import { Injectable } from '@nestjs/common';
import { Prisma, SystemRole, User } from '@prisma/client';

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
   * Promotes a user to a new system role (e.g. FAMILY_MEMBER → FAMILY_MANAGER
   * when they create their first family).
   */
  updateSystemRole(id: string, systemRole: SystemRole): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { systemRole } });
  }
}
