import { createHash, randomInt } from 'node:crypto';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { RefreshTokenService } from './refresh-token.service';

/**
 * Quên/đặt lại mật khẩu bằng mã OTP 6 số (bảng `password_reset_tokens`).
 * Chỉ lưu sha256 của mã — mã thật chỉ gửi qua email một lần. Mỗi thời điểm
 * chỉ có tối đa 1 mã còn hiệu lực cho mỗi user (mã cũ bị vô hiệu khi tạo mã mới).
 *
 * Cả 2 endpoint đều KHÔNG cần đăng nhập nên mọi phản hồi phải chống dò email:
 * `requestReset` không bao giờ ném lỗi; `reset` dùng chung một message lỗi
 * cho email không tồn tại / mã sai định dạng vòng đời.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly usersService: UsersService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Gửi OTP đặt lại mật khẩu. Mọi nhánh đều trả `null` im lặng (email không
   * tồn tại, tài khoản bị khóa, đang trong cooldown) — chống dò email; chống
   * spam đã có @Throttle ở controller.
   */
  async requestReset(email: string): Promise<null> {
    const user = await this.usersService.findByEmail(email);
    if (
      !user ||
      user.accountStatus !== AccountStatus.ACTIVE ||
      !user.passwordHash
    ) {
      return null;
    }

    if (await this.isInCooldown(user.id)) {
      this.logger.debug(
        `Bỏ qua yêu cầu reset password cho user ${user.id}: đang trong cooldown.`,
      );
      return null;
    }

    // Mỗi lúc chỉ 1 OTP sống: vô hiệu các mã chưa dùng trước khi tạo mã mới.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = this.genOtp();
    const expiresAt = new Date(Date.now() + this.otpExpiresMinutes * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, codeHash: this.hash(code), expiresAt },
    });

    await this.mail.sendPasswordResetOtp(email, code);
    return null;
  }

  /**
   * Đặt lại mật khẩu bằng OTP. Đúng mã → đổi passwordHash + tiêu thụ mã
   * (transaction), rồi thu hồi toàn bộ refresh token (đăng xuất mọi thiết bị).
   */
  async reset(email: string, code: string, newPassword: string): Promise<null> {
    const invalid = () =>
      new BadRequestException('Mã không hợp lệ hoặc đã hết hạn');

    const user = await this.usersService.findByEmail(email);
    if (
      !user ||
      user.accountStatus !== AccountStatus.ACTIVE ||
      !user.passwordHash
    ) {
      throw invalid();
    }

    const token = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!token || token.expiresAt.getTime() <= Date.now()) {
      throw invalid();
    }

    if (token.attempts >= this.maxAttempts) {
      throw new BadRequestException(
        'Nhập sai quá số lần cho phép, vui lòng yêu cầu mã mới',
      );
    }

    if (this.hash(code) !== token.codeHash) {
      await this.prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Mã xác thực không đúng');
    }

    const passwordHash = await bcrypt.hash(newPassword, this.saltRounds);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
    ]);

    // Đổi mật khẩu xong thì đăng xuất mọi thiết bị (chuẩn bảo mật).
    await this.refreshTokenService.revokeAllForUser(user.id);
    return null;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async isInCooldown(userId: string): Promise<boolean> {
    const last = await this.prisma.passwordResetToken.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return (
      !!last &&
      Date.now() - last.createdAt.getTime() < this.resendCooldownSeconds * 1000
    );
  }

  private genOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private get otpExpiresMinutes(): number {
    return this.config.get<number>('passwordReset.otpExpiresMinutes', 10);
  }

  private get resendCooldownSeconds(): number {
    return this.config.get<number>('passwordReset.resendCooldownSeconds', 60);
  }

  private get maxAttempts(): number {
    return this.config.get<number>('passwordReset.maxAttempts', 5);
  }

  private get saltRounds(): number {
    return this.config.get<number>('bcrypt.saltRounds', 10);
  }
}
