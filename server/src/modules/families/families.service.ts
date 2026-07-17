import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FamilyRole,
  MemberStatus,
  NotificationPriority,
  NotificationType,
  ProvisioningActionType,
  ProvisioningStatus,
  Prisma,
  Relationship,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { FamilyMembersService } from '../family-members/family-members.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SosGateway } from '../sos/sos.gateway';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { UpdateFamilyDto } from './dto/update-family.dto';
import { generateInviteCode } from './invite-code.util';

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
  private readonly logger = new Logger(FamiliesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly familyMembersService: FamilyMembersService,
    private readonly sosGateway: SosGateway,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly notificationsService: NotificationsService,
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

    const removedMember = await this.familyMembersService.remove(
      familyId,
      targetUserId,
    );
    // Evict the removed member from the workspace's realtime SOS room.
    this.sosGateway.kickMemberFromWorkspace(targetUserId, familyId);

    // Member đã bị xóa thành công — lỗi thông báo không được phép biến thao
    // tác đã thành công thành lỗi 5xx.
    try {
      // Persist cho các manager/deputy; người bị xóa nhận push-only (membership
      // đã REMOVED, không đọc được notification trong family nữa).
      const managers = await this.prisma.familyMember.findMany({
        where: {
          familyId,
          status: MemberStatus.ACTIVE,
          familyRole: {
            in: [FamilyRole.FAMILY_MANAGER, FamilyRole.DEPUTY_MEMBER],
          },
        },
        select: { id: true },
      });
      await this.notificationsService.notify(
        familyId,
        managers.map((m) => m.id),
        {
          type: NotificationType.MEMBER,
          priority: NotificationPriority.NORMAL,
          title: 'Thành viên đã bị xóa',
          body: 'Một thành viên đã bị xóa khỏi gia đình.',
          referenceType: 'FAMILY_MEMBER',
          referenceId: removedMember.id,
        },
      );
      await this.notificationsService.notifyUsersEphemeral([targetUserId], {
        familyId: null,
        type: NotificationType.MEMBER,
        priority: NotificationPriority.NORMAL,
        title: 'Bạn đã bị xóa khỏi gia đình',
        body: 'Bạn không còn là thành viên của gia đình này.',
        referenceType: 'FAMILY',
        referenceId: familyId,
      });
    } catch (err) {
      this.logger.error(
        `Không thể gửi thông báo xóa thành viên (family ${familyId}): ${(err as Error).message}`,
      );
    }
    return null;
  }

  /** Mã mời hiện tại của family — null nếu manager chưa tạo. */
  async getInviteCode(
    familyId: string,
  ): Promise<{ inviteCode: string | null }> {
    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      select: { inviteCode: true },
    });
    if (!family) {
      throw new NotFoundException('Không tìm thấy gia đình');
    }
    return { inviteCode: family.inviteCode };
  }

  /**
   * Tạo mã lần đầu hoặc đổi mã (mã cũ vô hiệu ngay). Retry khi đụng unique
   * (xác suất cực thấp với không gian 32^8).
   */
  async regenerateInviteCode(
    familyId: string,
  ): Promise<{ inviteCode: string }> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const inviteCode = generateInviteCode();
      try {
        const family = await this.prisma.family.update({
          where: { id: familyId },
          data: { inviteCode },
          select: { inviteCode: true },
        });
        return { inviteCode: family.inviteCode! };
      } catch (error) {
        const isDuplicate =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002';
        if (!isDuplicate) throw error;
      }
    }
    throw new BadRequestException('Không thể tạo mã mời, vui lòng thử lại');
  }
}
