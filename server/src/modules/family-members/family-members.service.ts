import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  FamilyMember,
  FamilyRole,
  MemberStatus,
  Relationship,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

const memberUserSelect = {
  id: true,
  email: true,
  fullName: true,
  userType: true,
} as const;

export interface CreateFamilyMemberInput {
  familyId: string;
  userId: string;
  familyRole?: FamilyRole;
  relationship?: Relationship;
}

/**
 * Data-access for the `family_members` join table.
 */
@Injectable()
export class FamilyMembersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateFamilyMemberInput): Promise<FamilyMember> {
    await this.assertCanAddMember(input.familyId);
    return this.prisma.familyMember.create({ data: input });
  }

  /**
   * Enforces the family's plan member cap. Counts ACTIVE members against the
   * subscribed plan's `maxMembers`. Existing members are kept on downgrade —
   * only adding past the limit is blocked. No-op if the family has no
   * subscription row configured (legacy/un-backfilled families).
   */
  async assertCanAddMember(familyId: string): Promise<void> {
    const subscription = await this.prisma.familySubscription.findUnique({
      where: { familyId },
      include: { plan: true },
    });
    if (!subscription) return;

    const activeCount = await this.prisma.familyMember.count({
      where: { familyId, status: MemberStatus.ACTIVE },
    });
    if (activeCount >= subscription.plan.maxMembers) {
      throw new ForbiddenException(
        'Đã đạt số thành viên tối đa của gói hiện tại',
      );
    }
  }

  findByFamilyAndUser(
    familyId: string,
    userId: string,
  ): Promise<FamilyMember | null> {
    return this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
    });
  }

  listByFamily(familyId: string) {
    return this.prisma.familyMember.findMany({
      where: { familyId, status: MemberStatus.ACTIVE },
      include: { user: { select: memberUserSelect } },
      orderBy: { joinedAt: 'asc' },
    });
  }

  /** Families the user belongs to, with their membership info. */
  findMyFamilies(userId: string) {
    return this.prisma.family.findMany({
      where: {
        members: { some: { userId, status: MemberStatus.ACTIVE } },
      },
      include: {
        members: {
          where: { userId, status: MemberStatus.ACTIVE },
          select: { familyRole: true, relationship: true, joinedAt: true },
        },
        _count: {
          select: { members: { where: { status: MemberStatus.ACTIVE } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Soft-removes a member: marks the membership REMOVED and stamps `leftAt`
   * instead of hard-deleting the row. A hard delete would hit the many
   * `onDelete: Restrict` foreign keys pointing at FamilyMember (ledger
   * entries, tasks, budgets, goals…) and fail once the member has any
   * history. Keeping the row preserves that history.
   */
  remove(familyId: string, userId: string): Promise<FamilyMember> {
    return this.prisma.familyMember.update({
      where: { familyId_userId: { familyId, userId } },
      data: { status: MemberStatus.REMOVED, leftAt: new Date() },
    });
  }
}
