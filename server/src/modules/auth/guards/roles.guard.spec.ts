import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserType } from '@prisma/client';

import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const handler = () => undefined;
  const controller = class {};

  function context(user?: { userType: UserType }): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows SYSTEM_ADMIN for admin routes', () => {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserType.SYSTEM_ADMIN]);
    const guard = new RolesGuard(reflector);

    expect(
      guard.canActivate(context({ userType: UserType.SYSTEM_ADMIN })),
    ).toBe(true);
  });

  it('rejects NORMAL_USER for admin routes', () => {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key) =>
        key === ROLES_KEY ? [UserType.SYSTEM_ADMIN] : undefined,
      );
    const guard = new RolesGuard(reflector);

    expect(() =>
      guard.canActivate(context({ userType: UserType.NORMAL_USER })),
    ).toThrow(ForbiddenException);
  });
});
