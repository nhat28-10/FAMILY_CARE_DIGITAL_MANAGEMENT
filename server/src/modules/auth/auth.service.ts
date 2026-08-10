import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import {
  AccountStatus,
  Prisma,
  User,
  UserType,
  VerificationStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { SafeUser, sanitizeUser } from '../users/users.types';
import { UsersService } from '../users/users.service';
import { FirebaseLoginDto } from './dto/firebase-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { EmailVerificationService } from './email-verification.service';
import { FirebaseAuthService } from './firebase-auth.service';
import { PasswordResetService } from './password-reset.service';
import { RefreshTokenService } from './refresh-token.service';
import { JwtPayload } from './types/jwt-payload.type';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthTokenSession extends AuthTokens {
  refreshTokenId: string;
}

export interface AuthResult extends AuthTokens {
  user: SafeUser;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly passwordResetService: PasswordResetService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly firebaseAuthService: FirebaseAuthService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public use cases
  // ---------------------------------------------------------------------------

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email đã được sử dụng');
    }
    if (dto.phone && (await this.usersService.findByPhone(dto.phone))) {
      throw new ConflictException('Số điện thoại đã được sử dụng');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.saltRounds);

    let user: User;
    try {
      user = await this.usersService.create({
        email: dto.email,
        passwordHash,
        fullName: dto.fullName ?? null,
        phone: dto.phone ?? null,
        avatarUrl: dto.avatarUrl ?? null,
        // Account-level type only; family roles live on FamilyMember.familyRole.
        userType: UserType.NORMAL_USER,
      });
    } catch (err) {
      // Safety net for the race between the pre-checks above and the insert.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const target = err.meta?.target;
        const field = Array.isArray(target) ? target.join(',') : String(target);
        throw new ConflictException(
          field.includes('phone')
            ? 'Số điện thoại đã được sử dụng'
            : 'Email đã được sử dụng',
        );
      }
      throw err;
    }

    // Gửi OTP xác thực email (best-effort): lỗi mail không làm hỏng đăng ký vì
    // tài khoản UNVERIFIED vẫn được phép đăng nhập.
    try {
      await this.emailVerificationService.generateAndSend(user.id, user.email, {
        enforceCooldown: false,
      });
    } catch (err) {
      this.logger.error(
        `Gửi OTP xác thực khi đăng ký thất bại (user ${user.id}): ${(err as Error).message}`,
      );
    }

    return this.buildAuthResult(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);

    // Verify credentials. Use a generic message to avoid user enumeration.
    if (!user) {
      throw new UnauthorizedException('Thông tin đăng nhập không chính xác');
    }

    // Tài khoản social-only không có mật khẩu để so sánh.
    if (!user.passwordHash) {
      throw new BadRequestException(
        'Tài khoản này đăng nhập bằng Google, vui lòng dùng nút Đăng nhập Google',
      );
    }

    if (!(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Thông tin đăng nhập không chính xác');
    }

    if (user.accountStatus !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Tài khoản đã bị khóa');
    }

    // Stamp last login, then issue tokens with the updated record.
    const loggedInUser = await this.usersService.updateLastLogin(user.id);
    return this.buildAuthResult(loggedInUser);
  }

  /**
   * Đăng nhập bằng Google: verify Firebase ID token → tìm user theo
   * firebaseUid, chưa có thì auto-link theo email (đã verify) hoặc tạo mới,
   * rồi phát cặp token nội bộ như login thường.
   */
  async loginWithFirebase(dto: FirebaseLoginDto): Promise<AuthResult> {
    const decoded = await this.firebaseAuthService.verifyIdToken(dto.idToken);

    let user = await this.usersService.findByFirebaseUid(decoded.uid);

    if (!user) {
      // Chỉ tin email đã được Google xác minh — điều kiện để auto-link an toàn.
      if (!decoded.email || !decoded.email_verified) {
        throw new UnauthorizedException('Tài khoản Google chưa xác minh email');
      }

      const existing = await this.usersService.findByEmail(decoded.email);
      try {
        user = existing
          ? await this.usersService.linkFirebaseUid(existing.id, decoded.uid)
          : await this.usersService.create({
              email: decoded.email,
              passwordHash: null,
              firebaseUid: decoded.uid,
              fullName: decoded.name ?? null,
              avatarUrl: decoded.picture ?? null,
              userType: UserType.NORMAL_USER,
              verificationStatus: VerificationStatus.VERIFIED,
            });
      } catch (err) {
        // Race giữa 2 lần đăng nhập Google đầu tiên cùng tài khoản: người
        // thua cuộc chạm unique index (firebaseUid hoặc email) → re-fetch
        // theo firebaseUid, người thắng đã tạo/gắn xong thì dùng lại record đó.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const refetched = await this.usersService.findByFirebaseUid(
            decoded.uid,
          );
          if (!refetched) {
            throw err;
          }
          user = refetched;
        } else {
          throw err;
        }
      }
    }

    if (user.accountStatus !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Tài khoản đã bị khóa');
    }

    const loggedInUser = await this.usersService.updateLastLogin(user.id);
    return this.buildAuthResult(loggedInUser);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResult> {
    // 1. Verify signature & expiry against the refresh secret.
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(
        dto.refreshToken,
        {
          secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
        },
      );
    } catch {
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã hết hạn',
      );
    }

    // 2. The token must correspond to a live session in refresh_tokens.
    if (
      !payload.jti ||
      !(await this.refreshTokenService.isValid(
        payload.jti,
        payload.sub,
        dto.refreshToken,
      ))
    ) {
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã hết hạn',
      );
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã hết hạn',
      );
    }
    if (user.accountStatus !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Tài khoản đã bị khóa');
    }

    // 3. Rotate: revoke the used session and issue a fresh pair.
    await this.refreshTokenService.revoke(payload.jti);
    return this.buildAuthResult(user);
  }

  /**
   * Logs out. If a refresh token is supplied, only that session is revoked
   * (per-device logout); otherwise every session of the user is revoked.
   */
  async logout(userId: string, dto: LogoutDto): Promise<null> {
    if (dto.refreshToken) {
      try {
        const payload = await this.jwtService.verifyAsync<JwtPayload>(
          dto.refreshToken,
          { secret: this.config.getOrThrow<string>('jwt.refreshSecret') },
        );
        if (payload.sub === userId && payload.jti) {
          await this.refreshTokenService.revoke(payload.jti);
          return null;
        }
      } catch {
        // Fall through to revoke-all on an invalid token.
      }
    }

    await this.refreshTokenService.revokeAllForUser(userId);
    return null;
  }

  async getProfile(userId: string): Promise<SafeUser> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Không tìm thấy người dùng');
    }
    return sanitizeUser(user);
  }

  /** Cấp token nội bộ cho một user đã được backend xác thực qua luồng trusted khác. */
  async issueTokensForUserId(userId: string): Promise<AuthResult> {
    const { auth } = await this.issueTokenSessionForUserId(userId);
    return auth;
  }

  async issueTokenSessionForUserId(
    userId: string,
  ): Promise<{ auth: AuthResult; refreshTokenId: string }> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Không tìm thấy người dùng');
    }
    if (user.accountStatus !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Tài khoản đã bị khóa');
    }

    const loggedInUser = await this.usersService.updateLastLogin(user.id);
    const tokenSession = await this.generateTokens(loggedInUser);
    const { refreshTokenId, ...tokens } = tokenSession;
    return {
      auth: { user: sanitizeUser(loggedInUser), ...tokens },
      refreshTokenId,
    };
  }

  /** Cập nhật hồ sơ cá nhân của user hiện tại. */
  async updateProfile(
    userId: string,
    dto: UpdateMyProfileDto,
  ): Promise<SafeUser> {
    if (dto.phone !== undefined && dto.phone !== null) {
      const existing = await this.usersService.findByPhone(dto.phone);
      if (existing && existing.id !== userId) {
        throw new ConflictException(
          'Sá»‘ Ä‘iá»‡n thoáº¡i Ä‘Ã£ Ä‘Æ°á»£c sá»­ dá»¥ng',
        );
      }
    }

    try {
      const updated = await this.usersService.updateProfile(userId, {
        fullName: this.profileString(dto.fullName),
        phone: this.profileString(dto.phone),
        avatarUrl: this.profileString(dto.avatarUrl),
      });
      return sanitizeUser(updated);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const target = err.meta?.target;
        const field = Array.isArray(target) ? target.join(',') : String(target);
        throw new ConflictException(
          field.includes('phone')
            ? 'Sá»‘ Ä‘iá»‡n thoáº¡i Ä‘Ã£ Ä‘Æ°á»£c sá»­ dá»¥ng'
            : 'ThÃ´ng tin há»“ sÆ¡ Ä‘Ã£ Ä‘Æ°á»£c sá»­ dá»¥ng',
        );
      }
      throw err;
    }
  }

  async verifyEmail(userId: string, code: string): Promise<SafeUser> {
    await this.emailVerificationService.verify(userId, code);
    return this.getProfile(userId);
  }

  /** Gửi lại mã OTP xác thực (có cooldown). */
  async resendVerification(user: SafeUser): Promise<null> {
    if (user.verificationStatus === VerificationStatus.VERIFIED) {
      throw new BadRequestException('Tài khoản đã được xác thực');
    }
    await this.emailVerificationService.generateAndSend(user.id, user.email, {
      enforceCooldown: true,
    });
    return null;
  }

  /** Gửi OTP đặt lại mật khẩu (im lặng nếu email không tồn tại — chống dò email). */
  forgotPassword(dto: ForgotPasswordDto): Promise<null> {
    return this.passwordResetService.requestReset(dto.email);
  }

  /** Đặt lại mật khẩu bằng OTP; thu hồi toàn bộ refresh token sau khi đổi. */
  resetPassword(dto: ResetPasswordDto): Promise<null> {
    return this.passwordResetService.reset(
      dto.email,
      dto.code,
      dto.newPassword,
    );
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Issues a fresh token pair, persists the new refresh session and returns the
   * sanitized user together with the tokens.
   */
  private async buildAuthResult(user: User): Promise<AuthResult> {
    const { refreshTokenId: _refreshTokenId, ...tokens } =
      await this.generateTokens(user);
    return { user: sanitizeUser(user), ...tokens };
  }

  private async generateTokens(user: User): Promise<AuthTokenSession> {
    const basePayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      userType: user.userType,
    };

    // Pre-generate the refresh session id so it can be embedded as `jti`.
    const jti = randomUUID();

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(basePayload, {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
        expiresIn: this.config.get<string>(
          'jwt.accessExpiresIn',
          '15m',
        ) as JwtSignOptions['expiresIn'],
      }),
      this.jwtService.signAsync(
        { ...basePayload, jti },
        {
          secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
          expiresIn: this.config.get<string>(
            'jwt.refreshExpiresIn',
            '7d',
          ) as JwtSignOptions['expiresIn'],
        },
      ),
    ]);

    // Persist the session using the refresh token's own expiry.
    const decoded = this.jwtService.decode(refreshToken);

    if (!decoded || typeof decoded.exp !== 'number') {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }

    const expiresAt = new Date(decoded.exp * 1000);
    await this.refreshTokenService.store(jti, user.id, refreshToken, expiresAt);

    return { accessToken, refreshToken, refreshTokenId: jti };
  }

  private get saltRounds(): number {
    return this.config.get<number>('bcrypt.saltRounds', 10);
  }

  private profileString(value: string | null | undefined) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
}
