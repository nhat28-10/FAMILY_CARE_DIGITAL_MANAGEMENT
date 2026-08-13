import { createHash, randomInt } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VerificationStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

interface GenerateOptions {
  /** Bật kiểm tra cooldown (dùng cho resend, không dùng khi đăng ký). */
  enforceCooldown: boolean;
}

/**
 * Quản lý mã OTP xác thực email (bảng `email_verification_tokens`). Chỉ lưu
 * sha256 của mã 6 số — mã thật chỉ gửi qua email một lần. Mỗi thời điểm chỉ có
 * tối đa 1 mã còn hiệu lực cho mỗi user (mã cũ bị vô hiệu khi tạo mã mới).
 */
@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Sinh OTP mới, vô hiệu các OTP cũ còn hiệu lực, lưu hash và gửi qua email.
   * Lỗi gửi mail do MailService nuốt (best-effort) nên không ném ra đây.
   */
  async generateAndSend(
    userId: string,
    email: string,
    { enforceCooldown }: GenerateOptions,
  ): Promise<void> {
    if (enforceCooldown) {
      await this.assertNotInCooldown(userId);
    }

    // Mỗi lúc chỉ 1 OTP sống: vô hiệu các mã chưa dùng trước khi tạo mã mới.
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = this.genOtp();
    const expiresAt = new Date(Date.now() + this.otpExpiresMinutes * 60 * 1000);

    await this.prisma.emailVerificationToken.create({
      data: { userId, codeHash: this.hash(code), expiresAt },
    });

    await this.mail.sendVerificationOtp(email, code);
  }

  /**
   * Xác thực OTP người dùng nhập. Đúng → chuyển user sang VERIFIED (transaction).
   */
  async verify(userId: string, code: string): Promise<void> {
    const token = await this.prisma.emailVerificationToken.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!token || token.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Mã không hợp lệ hoặc đã hết hạn');
    }

    if (token.attempts >= this.maxAttempts) {
      throw new BadRequestException(
        'Nhập sai quá số lần cho phép, vui lòng gửi lại mã',
      );
    }

    if (this.hash(code) !== token.codeHash) {
      await this.prisma.emailVerificationToken.update({
        where: { id: token.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Mã xác thực không đúng');
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { verificationStatus: VerificationStatus.VERIFIED },
      }),
    ]);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async assertNotInCooldown(userId: string): Promise<void> {
    const last = await this.prisma.emailVerificationToken.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (
      last &&
      Date.now() - last.createdAt.getTime() < this.resendCooldownSeconds * 1000
    ) {
      throw new BadRequestException('Vui lòng đợi trước khi gửi lại mã');
    }
  }

  private genOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private get otpExpiresMinutes(): number {
    return this.config.get<number>('emailVerification.otpExpiresMinutes', 10);
  }

  private get resendCooldownSeconds(): number {
    return this.config.get<number>(
      'emailVerification.resendCooldownSeconds',
      60,
    );
  }

  private get maxAttempts(): number {
    return this.config.get<number>('emailVerification.maxAttempts', 5);
  }
}
