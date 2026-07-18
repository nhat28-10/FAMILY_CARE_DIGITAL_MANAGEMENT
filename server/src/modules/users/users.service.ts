import { Injectable } from '@nestjs/common';
import { Prisma, User, VerificationStatus } from '@prisma/client';

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

  findByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Records a successful login by stamping `lastLoginAt`. */
  updateLastLogin(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  findByFirebaseUid(firebaseUid: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { firebaseUid } });
  }

  /**
   * Gắn Firebase UID vào tài khoản sẵn có (auto-link đăng nhập Google).
   * Google đã xác minh email (email_verified=true là điều kiện link) — cùng
   * bằng chứng sở hữu hộp thư như OTP, nên nâng luôn verificationStatus.
   */
  linkFirebaseUid(id: string, firebaseUid: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { firebaseUid, verificationStatus: VerificationStatus.VERIFIED },
    });
  }
}
