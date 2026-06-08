import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { SafeUser } from '../../users/users.types';

/**
 * Extracts the authenticated user (populated by JwtStrategy) from the request.
 *
 * @example
 * me(@CurrentUser() user: SafeUser) {}
 * logout(@CurrentUser('id') userId: string) {}
 */
export const CurrentUser = createParamDecorator(
  (data: keyof SafeUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: SafeUser }>();
    const user = request.user;
    if (!user) {
      return undefined;
    }
    return data ? user[data] : user;
  },
);
