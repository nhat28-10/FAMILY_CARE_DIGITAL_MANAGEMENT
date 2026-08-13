import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';

import { VerifiedGuard } from './verified.guard';

type GuardTestUser = {
  verificationStatus: VerificationStatus;
};

function ctxWith(user?: GuardTestUser): ExecutionContext {
  const request = { user };

  return {
    switchToHttp: () => ({
      getRequest: <T = typeof request>(): T => request as T,
    }),
  } as ExecutionContext;
}

describe('VerifiedGuard', () => {
  const guard = new VerifiedGuard();

  it('cho qua khi user đã VERIFIED', () => {
    const ctx = ctxWith({ verificationStatus: VerificationStatus.VERIFIED });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('chặn khi user UNVERIFIED', () => {
    const ctx = ctxWith({ verificationStatus: VerificationStatus.UNVERIFIED });

    expect(() => {
      guard.canActivate(ctx);
    }).toThrow(ForbiddenException);
  });

  it('chặn khi không có user', () => {
    expect(() => {
      guard.canActivate(ctxWith(undefined));
    }).toThrow(ForbiddenException);
  });
});
