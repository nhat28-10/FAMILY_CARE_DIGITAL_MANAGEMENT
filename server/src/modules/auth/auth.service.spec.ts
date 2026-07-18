import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { AccountStatus, UserType, VerificationStatus } from '@prisma/client';

import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { EmailVerificationService } from './email-verification.service';
import type { FirebaseAuthService } from './firebase-auth.service';
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
    findByFirebaseUid: jest.Mock;
    linkFirebaseUid: jest.Mock;
  };
  let refreshTokens: { store: jest.Mock };
  let jwtService: { signAsync: jest.Mock; decode: jest.Mock };
  let firebaseAuth: { verifyIdToken: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateLastLogin: jest.fn(),
      findByFirebaseUid: jest.fn(),
      linkFirebaseUid: jest.fn(),
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
    firebaseAuth = { verifyIdToken: jest.fn() };

    service = new AuthService(
      usersService as unknown as UsersService,
      refreshTokens as unknown as RefreshTokenService,
      emailVerification as unknown as EmailVerificationService,
      passwordReset as unknown as PasswordResetService,
      jwtService as unknown as JwtService,
      config as unknown as ConfigService,
      firebaseAuth as unknown as FirebaseAuthService,
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

  describe('loginWithFirebase', () => {
    const decoded = {
      uid: 'fb-uid-1',
      email: 'google@gmail.com',
      email_verified: true,
      name: 'Google User',
      picture: 'https://lh3.googleusercontent.com/a/pic',
    };

    it('logs in an already-linked user by firebaseUid', async () => {
      firebaseAuth.verifyIdToken.mockResolvedValue(decoded);
      const linked = { ...baseUser, firebaseUid: decoded.uid };
      usersService.findByFirebaseUid.mockResolvedValue(linked);
      usersService.updateLastLogin.mockResolvedValue(linked);

      const result = await service.loginWithFirebase({ idToken: 't' });

      expect(result.user.id).toBe(baseUser.id);
      expect(result.accessToken).toBe('signed-token');
      expect(usersService.create).not.toHaveBeenCalled();
      expect(usersService.linkFirebaseUid).not.toHaveBeenCalled();
    });

    it('auto-links an existing email/password account when email is verified', async () => {
      firebaseAuth.verifyIdToken.mockResolvedValue(decoded);
      usersService.findByFirebaseUid.mockResolvedValue(null);
      const existing = { ...baseUser, email: decoded.email };
      usersService.findByEmail.mockResolvedValue(existing);
      const linked = { ...existing, firebaseUid: decoded.uid };
      usersService.linkFirebaseUid.mockResolvedValue(linked);
      usersService.updateLastLogin.mockResolvedValue(linked);

      await service.loginWithFirebase({ idToken: 't' });

      expect(usersService.linkFirebaseUid).toHaveBeenCalledWith(
        existing.id,
        decoded.uid,
      );
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('rejects when the Google email is missing or unverified', async () => {
      firebaseAuth.verifyIdToken.mockResolvedValue({
        ...decoded,
        email_verified: false,
      });
      usersService.findByFirebaseUid.mockResolvedValue(null);

      await expect(service.loginWithFirebase({ idToken: 't' })).rejects.toThrow(
        new UnauthorizedException('Tài khoản Google chưa xác minh email'),
      );
      expect(usersService.linkFirebaseUid).not.toHaveBeenCalled();
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('creates a new VERIFIED user without password when the email is unknown', async () => {
      firebaseAuth.verifyIdToken.mockResolvedValue(decoded);
      usersService.findByFirebaseUid.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue(null);
      const created = {
        ...baseUser,
        email: decoded.email,
        passwordHash: null,
        firebaseUid: decoded.uid,
      };
      usersService.create.mockResolvedValue(created);
      usersService.updateLastLogin.mockResolvedValue(created);

      await service.loginWithFirebase({ idToken: 't' });

      expect(usersService.create).toHaveBeenCalledWith({
        email: decoded.email,
        passwordHash: null,
        firebaseUid: decoded.uid,
        fullName: decoded.name,
        avatarUrl: decoded.picture,
        userType: UserType.NORMAL_USER,
        verificationStatus: VerificationStatus.VERIFIED,
      });
    });

    it('propagates verification failures from FirebaseAuthService', async () => {
      firebaseAuth.verifyIdToken.mockRejectedValue(
        new UnauthorizedException('Token Google không hợp lệ hoặc đã hết hạn'),
      );

      await expect(
        service.loginWithFirebase({ idToken: 'bad' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects locked accounts', async () => {
      firebaseAuth.verifyIdToken.mockResolvedValue(decoded);
      usersService.findByFirebaseUid.mockResolvedValue({
        ...baseUser,
        firebaseUid: decoded.uid,
        accountStatus: AccountStatus.SUSPENDED,
      });

      await expect(service.loginWithFirebase({ idToken: 't' })).rejects.toThrow(
        new ForbiddenException('Tài khoản đã bị khóa'),
      );
    });

    it('propagates 503 when Google login is not configured', async () => {
      firebaseAuth.verifyIdToken.mockRejectedValue(
        new ServiceUnavailableException('Đăng nhập Google chưa được cấu hình'),
      );

      await expect(service.loginWithFirebase({ idToken: 't' })).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
