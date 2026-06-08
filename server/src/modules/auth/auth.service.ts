import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { SystemRole, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { SafeUser, sanitizeUser } from '../users/users.types';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenService } from './refresh-token.service';
import { JwtPayload } from './types/jwt-payload.type';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: SafeUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public use cases
  // ---------------------------------------------------------------------------

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.saltRounds);

    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName ?? null,
      // New accounts start as FAMILY_MEMBER; creating a family promotes them.
      systemRole: SystemRole.FAMILY_MEMBER,
    });

    return this.buildAuthResult(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);

    // Verify credentials. Use a generic message to avoid user enumeration.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account is locked');
    }

    return this.buildAuthResult(user);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResult> {
    // 1. Verify signature & expiry against the refresh secret.
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(dto.refreshToken, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
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
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (!user.isActive) {
      throw new ForbiddenException('Account is locked');
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
      throw new UnauthorizedException('User not found');
    }
    return sanitizeUser(user);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Issues a fresh token pair, persists the new refresh session and returns the
   * sanitized user together with the tokens.
   */
  private async buildAuthResult(user: User): Promise<AuthResult> {
    const tokens = await this.generateTokens(user);
    return { user: sanitizeUser(user), ...tokens };
  }

  private async generateTokens(user: User): Promise<AuthTokens> {
    const basePayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      systemRole: user.systemRole,
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
    const decoded = this.jwtService.decode(refreshToken) as { exp: number };
    const expiresAt = new Date(decoded.exp * 1000);
    await this.refreshTokenService.store(jti, user.id, refreshToken, expiresAt);

    return { accessToken, refreshToken };
  }

  private get saltRounds(): number {
    return this.config.get<number>('bcrypt.saltRounds', 10);
  }
}
