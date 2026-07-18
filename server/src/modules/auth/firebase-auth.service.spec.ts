import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { FirebaseAuthService } from './firebase-auth.service';

const mockVerifyIdToken = jest.fn();

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  auth: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

const serviceAccountB64 = Buffer.from(
  JSON.stringify({ projectId: 'demo', clientEmail: 'a@b.c', privateKey: 'k' }),
).toString('base64');

function makeService(envValue: string): FirebaseAuthService {
  const config = {
    get: jest.fn().mockReturnValue(envValue),
  } as unknown as ConfigService;
  const service = new FirebaseAuthService(config);
  service.onModuleInit();
  return service;
}

describe('FirebaseAuthService', () => {
  beforeEach(() => {
    mockVerifyIdToken.mockReset();
  });

  it('throws 503 when FIREBASE_SERVICE_ACCOUNT is empty', async () => {
    const service = makeService('');

    await expect(service.verifyIdToken('any')).rejects.toThrow(
      new ServiceUnavailableException('Đăng nhập Google chưa được cấu hình'),
    );
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it('returns the decoded token when Firebase accepts it', async () => {
    const decoded = { uid: 'fb-1', email: 'u@gmail.com', email_verified: true };
    mockVerifyIdToken.mockResolvedValue(decoded);
    const service = makeService(serviceAccountB64);

    await expect(service.verifyIdToken('good-token')).resolves.toBe(decoded);
    expect(mockVerifyIdToken).toHaveBeenCalledWith('good-token');
  });

  it('maps Firebase verification errors to 401 with a Vietnamese message', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('expired'));
    const service = makeService(serviceAccountB64);

    await expect(service.verifyIdToken('bad-token')).rejects.toThrow(
      new UnauthorizedException('Token Google không hợp lệ hoặc đã hết hạn'),
    );
  });
});
