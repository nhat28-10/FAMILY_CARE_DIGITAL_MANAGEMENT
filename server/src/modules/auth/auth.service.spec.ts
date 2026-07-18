import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { AccountStatus, UserType, VerificationStatus } from '@prisma/client';

import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { EmailVerificationService } from './email-verification.service';
import type { PasswordResetService } from './password-reset.service';
import type { RefreshTokenService } from './refresh-token.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn().mockResolvedValue(false),
}));

const baseUser = {
  id: 'user-1',
  email: 'user@example.com',
  passwordHash: 'hash',
  fullName: 'User',
  phone: null,
  avatarUrl: null,
  userType: UserType.NORMAL_USER,
  accountStatus: AccountStatus.ACTIVE,
  verificationStatus: VerificationStatus.VERIFIED,
  firebaseUid: null,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService', () => {
  let usersService: {
    findByEmail: jest.Mock;
    findByPhone: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    updateLastLogin: jest.Mock;
  };
  let refreshTokens: { store: jest.Mock };
  let jwtService: { signAsync: jest.Mock; decode: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateLastLogin: jest.fn(),
    };
    refreshTokens = { store: jest.fn().mockResolvedValue(undefined) };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
      decode: jest
        .fn()
        .mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    };
    const emailVerification = {
      generateAndSend: jest.fn().mockResolvedValue(undefined),
    };
    const passwordReset = {};
    const config = {
      get: jest.fn((_key: string, def?: unknown) => def),
      getOrThrow: jest.fn().mockReturnValue('secret'),
    };

    service = new AuthService(
      usersService as unknown as UsersService,
      refreshTokens as unknown as RefreshTokenService,
      emailVerification as unknown as EmailVerificationService,
      passwordReset as unknown as PasswordResetService,
      jwtService as unknown as JwtService,
      config as unknown as ConfigService,
    );
  });

  describe('login', () => {
    it('rejects password login for a Google-only account (passwordHash null)', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...baseUser,
        passwordHash: null,
      });

      await expect(
        service.login({ email: baseUser.email, password: 'StrongP@ss1' }),
      ).rejects.toThrow(
        new BadRequestException(
          'Tài khoản này đăng nhập bằng Google, vui lòng dùng nút Đăng nhập Google',
        ),
      );
    });

    it('keeps the generic 401 for a wrong password', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);

      await expect(
        service.login({ email: baseUser.email, password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
