import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FamilyRole, Relationship } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { FamilyMembersService } from '../family-members/family-members.service';
import { SosGateway } from '../sos/sos.gateway';
import { CreateFamilyDto } from './dto/create-family.dto';
import { UpdateFamilyDto } from './dto/update-family.dto';

const memberInclude = {
  members: {
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          avatarUrl: true,
          userType: true,
        },
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
    private readonly sosGateway: SosGateway,
  ) {}

  /**
   * Creates a family and makes the creator its FAMILY_MANAGER member. The
   * family role lives entirely on FamilyMember (not on the user account).
   * Both steps run in a single transaction.
   */
  async create(userId: string, dto: CreateFamilyDto) {
    return this.prisma.$transaction(async (tx) => {
      const family = await tx.family.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          avatarUrl: dto.avatarUrl ?? null,
          createdById: userId,
        },
      });

      await tx.familyMember.create({
        data: {
          familyId: family.id,
          userId,
          familyRole: FamilyRole.FAMILY_MANAGER,
          relationship: dto.relationship ?? Relationship.OTHER,
        },
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
      throw new NotFoundException('Không tìm thấy gia đình');
    }
    return family;
  }

  async update(familyId: string, dto: UpdateFamilyDto) {
    return this.prisma.family.update({
      where: { id: familyId },
      // undefined fields are ignored by Prisma, so only provided ones update.
      data: {
        name: dto.name,
        description: dto.description,
        avatarUrl: dto.avatarUrl,
      },
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
      throw new NotFoundException(
        'Không tìm thấy thành viên trong gia đình này',
      );
    }
    if (target.familyRole === FamilyRole.FAMILY_MANAGER) {
      throw new BadRequestException('Không thể xóa quản lý gia đình');
    }

    await this.familyMembersService.remove(familyId, targetUserId);
    // Evict the removed member from the workspace's realtime SOS room.
    this.sosGateway.kickMemberFromWorkspace(targetUserId, familyId);
    return null;
  }
}
