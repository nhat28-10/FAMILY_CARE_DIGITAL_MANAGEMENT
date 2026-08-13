import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FamilyMember, FamilyRole, MemberStatus } from '@prisma/client';

import { SafeUser } from '../../users/users.types';
import { FAMILY_ROLES_KEY } from '../decorators/family-roles.decorator';
import { FamilyMembersService } from '../family-members.service';

interface RequestWithMembership {
  user?: SafeUser;
  params?: Record<string, string>;
  familyMember?: FamilyMember;
}

/**
 * Authorizes access to a specific family. Must run after JwtAuthGuard.
 *
 * - Reads `familyId` from the route params.
 * - 403 if the current user is not a member of that family.
 * - If `@FamilyRoles(...)` is present, 403 unless the member's familyRole matches.
 * - On success, attaches the membership to `request.familyMember`.
 */
@Injectable()
export class FamilyPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly familyMembersService: FamilyMembersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithMembership>();

    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Bạn cần đăng nhập');
    }

    const familyId = request.params?.familyId;
    if (!familyId) {
      throw new BadRequestException('Thiếu tham số familyId trên đường dẫn');
    }

    const membership = await this.familyMembersService.findByFamilyAndUser(
      familyId,
      user.id,
    );
    if (!membership) {
      throw new ForbiddenException(
        'Bạn không phải thành viên của gia đình này',
      );
    }
    if (membership.status !== MemberStatus.ACTIVE) {
      throw new ForbiddenException(
        'Tư cách thành viên gia đình không còn hoạt động',
      );
    }

    const requiredRoles = this.reflector.getAllAndOverride<FamilyRole[]>(
      FAMILY_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (
      requiredRoles &&
      requiredRoles.length > 0 &&
      !requiredRoles.includes(membership.familyRole)
    ) {
      throw new ForbiddenException(
        `Yêu cầu vai trò gia đình: ${requiredRoles.join(' hoặc ')}`,
      );
    }

    request.familyMember = membership;
    return true;
  }
}
