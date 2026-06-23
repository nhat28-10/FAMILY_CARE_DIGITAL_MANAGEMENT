import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { RefreshTokenService } from './refresh-token.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { VerifiedGuard } from './guards/verified.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * Authentication module: registration, login, refresh-token rotation, logout
 * and JWT/role-based authorization primitives reusable across the platform.
 *
 * JwtModule is registered with empty options because access and refresh tokens
 * are signed with distinct secrets/expirations supplied per-call in AuthService.
 */
@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RefreshTokenService,
    EmailVerificationService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    VerifiedGuard,
  ],
  exports: [AuthService, JwtAuthGuard, RolesGuard, VerifiedGuard],
})
export class AuthModule {}
