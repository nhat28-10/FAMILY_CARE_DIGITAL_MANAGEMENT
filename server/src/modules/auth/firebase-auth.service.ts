import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

/**
 * Verify Firebase ID token (đăng nhập Google trên mobile). Dùng chung app
 * firebase-admin mặc định với kênh FCM — cùng ENV `FIREBASE_SERVICE_ACCOUNT`
 * (base64 service-account JSON), guard `admin.apps.length` nên bên nào init
 * trước cũng được. ENV rỗng = tính năng tắt (dev không có Firebase) → 503.
 */
@Injectable()
export class FirebaseAuthService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseAuthService.name);
  private enabled = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const raw = this.config.get<string>('firebase.serviceAccount');
    if (!raw) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT trống — đăng nhập Google bị tắt.',
      );
      return;
    }
    try {
      const serviceAccount = JSON.parse(
        Buffer.from(raw, 'base64').toString('utf8'),
      ) as admin.ServiceAccount;
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }
      this.enabled = true;
    } catch (err) {
      this.logger.error(
        `FIREBASE_SERVICE_ACCOUNT không hợp lệ, tắt đăng nhập Google: ${(err as Error).message}`,
      );
    }
  }

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'Đăng nhập Google chưa được cấu hình',
      );
    }
    try {
      return await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      this.logger.warn(
        `Verify Firebase ID token thất bại: ${(err as Error & { code?: string }).code ?? ''} ${(err as Error).message}`,
      );
      throw new UnauthorizedException(
        'Token Google không hợp lệ hoặc đã hết hạn',
      );
    }
  }
}
