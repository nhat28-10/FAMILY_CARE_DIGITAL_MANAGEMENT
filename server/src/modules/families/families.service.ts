import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FamilyRole,
  MemberStatus,
  ProvisioningActionType,
  ProvisioningStatus,
  Relationship,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { FamilyMembersService } from '../family-members/family-members.service';
import { SosGateway } from '../sos/sos.gateway';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
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
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * Creates a family and makes the creator its FAMILY_MANAGER member. The
   * family role lives entirely on FamilyMember (not on the user account).
   * Both steps run in a single transaction.
   */
  async create(userId: string, dto: CreateFamilyDto) {
    const family = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const created = await tx.family.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          avatarUrl: dto.avatarUrl ?? null,
          createdById: userId,
        },
      });

      await tx.familyMember.create({
        data: {
          familyId: created.id,
          userId,
          familyRole: FamilyRole.FAMILY_MANAGER,
          relationship: dto.relationship ?? Relationship.OTHER,
        },
      });

      await tx.workspaceProvisioningLog.create({
        data: {
          workspaceId: created.id,
          actionType: ProvisioningActionType.CREATE,
          status: ProvisioningStatus.SUCCESS,
          message: 'Family workspace được tạo và kích hoạt thành công.',
          startedAt: now,
          finishedAt: now,
          createdByUserId: userId,
        },
      });

      await tx.workspaceProvisioningLog.create({
        data: {
          workspaceId: created.id,
          actionType: ProvisioningActionType.ACTIVATE,
          status: ProvisioningStatus.SUCCESS,
          message: 'Family workspace activated successfully.',
          startedAt: now,
          finishedAt: now,
          createdByUserId: userId,
        },
      });

      return tx.family.findUniqueOrThrow({
        where: { id: created.id },
        include: memberInclude,
      });
    });

    // Seed the default FREE subscription (no-op if FREE plan isn't configured).
    await this.subscriptionsService.ensureFreeSubscription(family.id);

    return family;
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
    // Treat an already-removed membership as not found — only ACTIVE members
    // can be removed (keeps the operation idempotent).
    if (!target || target.status !== MemberStatus.ACTIVE) {
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
