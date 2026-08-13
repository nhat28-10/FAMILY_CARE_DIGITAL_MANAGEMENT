import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';

import { SafeUser } from '../../users/users.types';

/**
 * Chặn các route nhạy cảm với tài khoản chưa xác thực email. Phải chạy sau
 * JwtAuthGuard để `request.user` đã được nạp.
 *
 * @example
 * @UseGuards(JwtAuthGuard, VerifiedGuard)
 */
@Injectable()
export class VerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: SafeUser }>();
    const user = request.user;

    if (!user || user.verificationStatus !== VerificationStatus.VERIFIED) {
      throw new ForbiddenException(
        'Vui lòng xác thực tài khoản để dùng chức năng này',
      );
    }

    return true;
  }
}
