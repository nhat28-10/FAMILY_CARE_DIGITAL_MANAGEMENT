import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FamilyMember } from '@prisma/client';

/**
 * Extracts the current family membership (populated by FamilyPermissionGuard)
 * from the request. Only available on routes guarded by FamilyPermissionGuard.
 *
 * @example
 * create(@CurrentFamilyMember() member: FamilyMember) {}
 * create(@CurrentFamilyMember('id') memberId: string) {}
 */
export const CurrentFamilyMember = createParamDecorator(
  (data: keyof FamilyMember | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ familyMember?: FamilyMember }>();
    const member = request.familyMember;
    if (!member) {
      return undefined;
    }
    return data ? member[data] : member;
  },
);
