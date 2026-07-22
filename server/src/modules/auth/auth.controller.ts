import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import type { SafeUser } from '../users/users.types';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { FirebaseLoginDto } from './dto/firebase-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Đăng ký thành công')
  @ApiOperation({
    summary: 'Register a new account (default role: FAMILY_MANAGER)',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'Account created and tokens issued',
  })
  @ApiResponse({ status: 409, description: 'Email is already registered' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Đăng nhập thành công')
  @ApiOperation({ summary: 'Authenticate with email & password' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login succeeded, tokens issued' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Account is locked' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('firebase')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Đăng nhập thành công')
  @ApiOperation({ summary: 'Đăng nhập bằng Google qua Firebase ID token' })
  @ApiBody({ type: FirebaseLoginDto })
  @ApiResponse({ status: 200, description: 'Login succeeded, tokens issued' })
  @ApiResponse({ status: 401, description: 'Invalid/expired Firebase token' })
  @ApiResponse({ status: 403, description: 'Account is locked' })
  @ApiResponse({ status: 503, description: 'Google login not configured' })
  firebaseLogin(@Body() dto: FirebaseLoginDto) {
    return this.authService.loginWithFirebase(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Làm mới token thành công')
  @ApiOperation({
    summary: 'Rotate the token pair using a valid refresh token',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'New access & refresh tokens issued',
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Đăng xuất thành công')
  @ApiOperation({
    summary:
      'Log out. Pass refreshToken to revoke only this device, omit to revoke all',
  })
  @ApiBody({ type: LogoutDto, required: false })
  @ApiResponse({ status: 200, description: 'Logged out' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  logout(@CurrentUser('id') userId: string, @Body() dto: LogoutDto) {
    return this.authService.logout(userId, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ResponseMessage('Lấy thông tin người dùng thành công')
  @ApiOperation({ summary: 'Get the currently authenticated user' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  me(@CurrentUser() user: SafeUser) {
    return this.authService.getProfile(user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ResponseMessage('Cáº­p nháº­t thÃ´ng tin ngÆ°á»i dÃ¹ng thÃ nh cÃ´ng')
  @ApiOperation({ summary: 'Update the currently authenticated user profile' })
  @ApiBody({ type: UpdateMyProfileDto })
  @ApiResponse({ status: 200, description: 'Current user profile updated' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  @ApiResponse({ status: 409, description: 'Phone is already registered' })
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateMyProfileDto) {
    return this.authService.updateProfile(userId, dto);
  }

  @Post('verify-email')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Xác thực tài khoản thành công')
  @ApiOperation({ summary: 'Verify the account email with the 6-digit OTP' })
  @ApiBody({ type: VerifyEmailDto })
  @ApiResponse({ status: 200, description: 'Account verified' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  verifyEmail(@CurrentUser('id') userId: string, @Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(userId, dto.code);
  }

  @Post('resend-verification')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Đã gửi lại mã xác thực')
  @ApiOperation({ summary: 'Resend the email verification OTP (rate-limited)' })
  @ApiResponse({ status: 200, description: 'Verification OTP resent' })
  @ApiResponse({
    status: 400,
    description: 'Already verified or resend on cooldown',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  resendVerification(@CurrentUser() user: SafeUser) {
    return this.authService.resendVerification(user);
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Nếu email tồn tại, mã đặt lại mật khẩu đã được gửi')
  @ApiOperation({
    summary:
      'Request a password-reset OTP (always returns 200 to prevent email enumeration)',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, description: 'OTP sent if the email exists' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Đặt lại mật khẩu thành công')
  @ApiOperation({
    summary: 'Reset the password with the 6-digit OTP; revokes all sessions',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password reset, all refresh tokens revoked',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid, expired or over-attempted OTP',
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
