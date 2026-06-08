import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FamilyRole, Relationship, SystemRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { FamilyMembersService } from '../family-members/family-members.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { UpdateFamilyDto } from './dto/update-family.dto';

const memberInclude = {
  members: {
    include: {
      user: {
        select: { id: true, email: true, fullName: true, systemRole: true },
      },
    },
    orderBy: { joinedAt: 'asc' as const },
  },
};

@Injectable()
export class FamiliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly familyMembersService: FamilyMembersService,
  ) {}

  /**
   * Creates a family, makes the creator its MANAGER member, and promotes the
   * creator to FAMILY_MANAGER system role if they were still a FAMILY_MEMBER.
   * All three steps run in a single transaction.
   */
  async create(userId: string, dto: CreateFamilyDto) {
    return this.prisma.$transaction(async (tx) => {
      const family = await tx.family.create({
        data: { name: dto.name, createdById: userId },
      });

      await tx.familyMember.create({
        data: {
          familyId: family.id,
          userId,
          familyRole: FamilyRole.MANAGER,
          relationship: dto.relationship ?? Relationship.OTHER,
        },
      });

      // Promote only if still a plain member (don't downgrade an ADMIN).
      await tx.user.updateMany({
        where: { id: userId, systemRole: SystemRole.FAMILY_MEMBER },
        data: { systemRole: SystemRole.FAMILY_MANAGER },
      });

      return tx.family.findUniqueOrThrow({
        where: { id: family.id },
        include: memberInclude,
      });
    });
  }

  findMyFamilies(userId: string) {
    return this.familyMembersService.findMyFamilies(userId);
  }

  async getById(familyId: string) {
    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      include: memberInclude,
    });
    if (!family) {
      throw new NotFoundException('Family not found');
    }
    return family;
  }

  async update(familyId: string, dto: UpdateFamilyDto) {
    return this.prisma.family.update({
      where: { id: familyId },
      data: { name: dto.name },
      include: memberInclude,
    });
  }

  /**
   * Removes a member from the family. A MANAGER cannot be removed via this
   * endpoint (avoids orphaning the family).
   */
  async removeMember(familyId: string, targetUserId: string): Promise<null> {
    const target = await this.familyMembersService.findByFamilyAndUser(
      familyId,
      targetUserId,
    );
    if (!target) {
      throw new NotFoundException('Member not found in this family');
    }
    if (target.familyRole === FamilyRole.MANAGER) {
      throw new BadRequestException('Cannot remove a family manager');
    }

    await this.familyMembersService.remove(familyId, targetUserId);
    return null;
  }
}
