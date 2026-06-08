import { Injectable } from '@nestjs/common';
import { FamilyMember, FamilyRole, Relationship } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

const memberUserSelect = {
  id: true,
  email: true,
  fullName: true,
  systemRole: true,
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

  create(input: CreateFamilyMemberInput): Promise<FamilyMember> {
    return this.prisma.familyMember.create({ data: input });
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
      where: { familyId },
      include: { user: { select: memberUserSelect } },
      orderBy: { joinedAt: 'asc' },
    });
  }

  /** Families the user belongs to, with their membership info. */
  findMyFamilies(userId: string) {
    return this.prisma.family.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: {
          where: { userId },
          select: { familyRole: true, relationship: true, joinedAt: true },
        },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  remove(familyId: string, userId: string): Promise<FamilyMember> {
    return this.prisma.familyMember.delete({
      where: { familyId_userId: { familyId, userId } },
    });
  }
}
