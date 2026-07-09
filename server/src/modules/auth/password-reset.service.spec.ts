import { createHash } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';
import { AccountStatus } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { PasswordResetService } from './password-reset.service';
import { RefreshTokenService } from './refresh-token.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-new-password'),
}));

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('PasswordResetService', () => {
  const email = 'user@example.com';
  const userId = 'user-id';
  const activeUser = {
    id: userId,
    email,
    accountStatus: AccountStatus.ACTIVE,
  };

  let prisma: {
    passwordResetToken: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: { update: jest.Mock };
    $transaction: jest.Mock;
  };
  let mail: { sendPasswordResetOtp: jest.Mock };
  let usersService: { findByEmail: jest.Mock };
  let refreshTokens: { revokeAllForUser: jest.Mock };
  let service: PasswordResetService;

  beforeEach(() => {
    prisma = {
      passwordResetToken: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: { update: jest.fn() },
      $transaction: jest.fn((input: unknown) =>
        Array.isArray(input)
          ? Promise.all(input)
          : (input as (tx: unknown) => unknown)(prisma),
      ),
    };
    mail = { sendPasswordResetOtp: jest.fn().mockResolvedValue(undefined) };
    usersService = { findByEmail: jest.fn() };
    refreshTokens = { revokeAllForUser: jest.fn().mockResolvedValue(2) };
    const config = {
      get: jest.fn((_key: string, def: unknown) => def),
    } as unknown as ConfigService;

    service = new PasswordResetService(
      prisma as unknown as PrismaService,
      mail as unknown as MailService,
      usersService as unknown as UsersService,
      refreshTokens as unknown as RefreshTokenService,
      config,
    );
  });

  describe('requestReset', () => {
    it('invalidates old tokens, stores the sha256 of a 6-digit OTP and emails it', async () => {
      usersService.findByEmail.mockResolvedValue(activeUser);
      prisma.passwordResetToken.findFirst.mockResolvedValue(null); // no cooldown

      await expect(service.requestReset(email)).resolves.toBeNull();

      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId, usedAt: null },
        data: { usedAt: expect.any(Date) as Date },
      });

      const createArgs = prisma.passwordResetToken.create.mock
        .calls[0][0] as { data: { userId: string; codeHash: string } };
      expect(createArgs.data.userId).toBe(userId);

      const sentCode = mail.sendPasswordResetOtp.mock.calls[0][1] as string;
      expect(sentCode).toMatch(/^\d{6}$/);
      expect(createArgs.data.codeHash).toBe(sha256(sentCode));
      expect(mail.sendPasswordResetOtp).toHaveBeenCalledWith(email, sentCode);
    });

    it('silently resolves null for an unknown email', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(service.requestReset(email)).resolves.toBeNull();

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordResetOtp).not.toHaveBeenCalled();
    });

    it('silently resolves null for a non-active account', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...activeUser,
        accountStatus: AccountStatus.SUSPENDED,
      });

      await expect(service.requestReset(email)).resolves.toBeNull();

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordResetOtp).not.toHaveBeenCalled();
    });

    it('silently resolves null while in resend cooldown', async () => {
      usersService.findByEmail.mockResolvedValue(activeUser);
      prisma.passwordResetToken.findFirst.mockResolvedValue({
        createdAt: new Date(), // just issued → within 60s cooldown
      });

      await expect(service.requestReset(email)).resolves.toBeNull();

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordResetOtp).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    const code = '123456';
    const liveToken = {
      id: 'token-id',
      userId,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: null,
      attempts: 0,
    };

    it('consumes the token, updates the password and revokes all sessions', async () => {
      usersService.findByEmail.mockResolvedValue(activeUser);
      prisma.passwordResetToken.findFirst.mockResolvedValue(liveToken);

      await expect(
        service.reset(email, code, 'NewStr0ng@Pass'),
      ).resolves.toBeNull();

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: liveToken.id },
        data: { usedAt: expect.any(Date) as Date },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { passwordHash: 'hashed-new-password' },
      });
      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(userId);
    });

    it('increments attempts and rejects a wrong OTP', async () => {
      usersService.findByEmail.mockResolvedValue(activeUser);
      prisma.passwordResetToken.findFirst.mockResolvedValue(liveToken);

      await expect(
        service.reset(email, '000000', 'NewStr0ng@Pass'),
      ).rejects.toThrow(new BadRequestException('Mã xác thực không đúng'));

      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: liveToken.id },
        data: { attempts: { increment: 1 } },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('rejects when attempts are exhausted, even with the right code', async () => {
      usersService.findByEmail.mockResolvedValue(activeUser);
      prisma.passwordResetToken.findFirst.mockResolvedValue({
        ...liveToken,
        attempts: 5,
      });

      await expect(
        service.reset(email, code, 'NewStr0ng@Pass'),
      ).rejects.toThrow(
        new BadRequestException(
          'Nhập sai quá số lần cho phép, vui lòng yêu cầu mã mới',
        ),
      );

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('rejects an expired OTP with the generic message', async () => {
      usersService.findByEmail.mockResolvedValue(activeUser);
      prisma.passwordResetToken.findFirst.mockResolvedValue({
        ...liveToken,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.reset(email, code, 'NewStr0ng@Pass'),
      ).rejects.toThrow(
        new BadRequestException('Mã không hợp lệ hoặc đã hết hạn'),
      );
    });

    it('rejects when no live token exists (already consumed)', async () => {
      usersService.findByEmail.mockResolvedValue(activeUser);
      prisma.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(
        service.reset(email, code, 'NewStr0ng@Pass'),
      ).rejects.toThrow(
        new BadRequestException('Mã không hợp lệ hoặc đã hết hạn'),
      );
    });

    it('rejects an unknown email with the same generic message', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.reset(email, code, 'NewStr0ng@Pass'),
      ).rejects.toThrow(
        new BadRequestException('Mã không hợp lệ hoặc đã hết hạn'),
      );

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
    });
  });
});
