import { ForbiddenException } from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';

import { VerifiedGuard } from './verified.guard';

function ctxWith(user: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

describe('VerifiedGuard', () => {
  const guard = new VerifiedGuard();

  it('cho qua khi user đã VERIFIED', () => {
    const ctx = ctxWith({ verificationStatus: VerificationStatus.VERIFIED });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('chặn khi user UNVERIFIED', () => {
    const ctx = ctxWith({ verificationStatus: VerificationStatus.UNVERIFIED });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('chặn khi không có user', () => {
    expect(() => guard.canActivate(ctxWith(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
