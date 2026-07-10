import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  ConversationStatus,
  ConversationType,
  FamilyRole,
  MemberStatus,
  ParticipantStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { ChatsGateway } from '../chats.gateway';
import type { CreateConversationDto } from '../dto/create-conversation.dto';
import type { UpdateConversationDto } from '../dto/update-conversation.dto';
import type { AddParticipantsDto } from '../dto/add-participants.dto';

/** Projection gọn của member nhúng trong payload chat (theo mẫu SOS). */
const memberSummary = {
  select: {
    id: true,
    displayName: true,
    familyRole: true,
    user: {
      select: { id: true, fullName: true, email: true, avatarUrl: true },
    },
  },
} satisfies Prisma.FamilyMemberDefaultArgs;

const participantInclude = {
  member: memberSummary,
} satisfies Prisma.ConversationParticipantInclude;

const conversationInclude = {
  participants: {
    where: { participantStatus: ParticipantStatus.ACTIVE },
    include: participantInclude,
    orderBy: { joinedAt: 'asc' },
  },
  createdByMember: memberSummary,
} satisfies Prisma.ConversationInclude;

/** Thông tin caller cần cho kiểm tra quyền trong service. */
export interface CallerMember {
  id: string;
  familyRole: FamilyRole;
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    // Gateway cũng gọi ngược service (join room theo hội thoại) — phá vòng phụ thuộc.
    @Inject(forwardRef(() => ChatsGateway))
    private readonly chatsGateway: ChatsGateway,
  ) {}

  // ---------------------------------------------------------------------------
  // Helpers dùng chung (MessagesService cũng gọi)
  // ---------------------------------------------------------------------------

  /** Verify hội thoại thuộc workspace + caller là participant ACTIVE. */
  async getParticipantOrThrow(
    workspaceId: string,
    conversationId: string,
    memberId: string,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { conversationId, workspaceId },
    });
    if (!conversation) {
      throw new NotFoundException('Không tìm thấy hội thoại');
    }
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_memberId: { conversationId, memberId } },
    });
    if (
      !participant ||
      participant.participantStatus !== ParticipantStatus.ACTIVE
    ) {
      throw new ForbiddenException('Bạn không ở trong hội thoại này');
    }
    return { conversation, participant };
  }

  /** Id các hội thoại member đang tham gia — gateway dùng để join room khi connect. */
  async listConversationIdsForMember(
    workspaceId: string,
    memberId: string,
  ): Promise<string[]> {
    const rows = await this.prisma.conversationParticipant.findMany({
      where: {
        memberId,
        participantStatus: ParticipantStatus.ACTIVE,
        conversation: { workspaceId },
      },
      select: { conversationId: true },
    });
    return rows.map((row) => row.conversationId);
  }

  // ---------------------------------------------------------------------------
  // Nhóm chat chung mặc định
  // ---------------------------------------------------------------------------

  /**
   * Đảm bảo family có nhóm chat chung + participants khớp danh sách thành viên
   * ACTIVE hiện tại (sync-on-read — không cần hook vào invitations).
   */
  async ensureDefaultConversation(workspaceId: string): Promise<void> {
    let conversation = await this.prisma.conversation.findFirst({
      where: { workspaceId, isDefault: true },
      select: { conversationId: true },
    });

    if (!conversation) {
      const family = await this.prisma.family.findUnique({
        where: { id: workspaceId },
        select: { name: true },
      });
      const manager = await this.prisma.familyMember.findFirst({
        where: { familyId: workspaceId, status: MemberStatus.ACTIVE },
        orderBy: [{ familyRole: 'asc' }, { joinedAt: 'asc' }],
        select: { id: true },
      });
      if (!manager) {
        return;
      }
      try {
        conversation = await this.prisma.conversation.create({
          data: {
            workspaceId,
            conversationType: ConversationType.GROUP,
            conversationName: family?.name ?? 'Gia đình',
            createdByMemberId: manager.id,
            isDefault: true,
          },
          select: { conversationId: true },
        });
      } catch (err) {
        // Partial unique index (workspace_id WHERE is_default) bắt race — đọc lại.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          conversation = await this.prisma.conversation.findFirst({
            where: { workspaceId, isDefault: true },
            select: { conversationId: true },
          });
        } else {
          throw err;
        }
      }
    }
    if (!conversation) {
      return;
    }

    const [activeMembers, participants] = await Promise.all([
      this.prisma.familyMember.findMany({
        where: { familyId: workspaceId, status: MemberStatus.ACTIVE },
        select: { id: true },
      }),
      this.prisma.conversationParticipant.findMany({
        where: { conversationId: conversation.conversationId },
        select: { memberId: true, participantStatus: true },
      }),
    ]);
    const activeMemberIds = new Set(activeMembers.map((m) => m.id));
    const byMemberId = new Map(participants.map((p) => [p.memberId, p]));

    const toCreate = [...activeMemberIds].filter((id) => !byMemberId.has(id));
    const toReactivate = participants
      .filter(
        (p) =>
          p.participantStatus === ParticipantStatus.LEFT &&
          activeMemberIds.has(p.memberId),
      )
      .map((p) => p.memberId);
    const toDeactivate = participants
      .filter(
        (p) =>
          p.participantStatus === ParticipantStatus.ACTIVE &&
          !activeMemberIds.has(p.memberId),
      )
      .map((p) => p.memberId);

    if (toCreate.length + toReactivate.length + toDeactivate.length === 0) {
      return;
    }
    const conversationId = conversation.conversationId;
    await this.prisma.$transaction([
      this.prisma.conversationParticipant.createMany({
        data: toCreate.map((memberId) => ({ conversationId, memberId })),
        skipDuplicates: true,
      }),
      this.prisma.conversationParticipant.updateMany({
        where: { conversationId, memberId: { in: toReactivate } },
        data: {
          participantStatus: ParticipantStatus.ACTIVE,
          leftAt: null,
        },
      }),
      this.prisma.conversationParticipant.updateMany({
        where: { conversationId, memberId: { in: toDeactivate } },
        data: { participantStatus: ParticipantStatus.LEFT, leftAt: new Date() },
      }),
    ]);
  }

  // ---------------------------------------------------------------------------
  // CRUD hội thoại
  // ---------------------------------------------------------------------------

  async list(workspaceId: string, memberId: string) {
    await this.ensureDefaultConversation(workspaceId);

    const conversations = await this.prisma.conversation.findMany({
      where: {
        workspaceId,
        participants: {
          some: { memberId, participantStatus: ParticipantStatus.ACTIVE },
        },
      },
      include: {
        ...conversationInclude,
        messages: {
          orderBy: { sentAt: 'desc' },
          take: 1,
          include: { senderMember: memberSummary },
        },
      },
      orderBy: [
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    });

    // unreadCount từng hội thoại: tin của người khác, chưa xóa, sau lastReadAt.
    const unreadCounts = await Promise.all(
      conversations.map((conversation) => {
        const me = conversation.participants.find(
          (p) => p.memberId === memberId,
        );
        return this.prisma.message.count({
          where: {
            conversationId: conversation.conversationId,
            deletedAt: null,
            senderMemberId: { not: memberId },
            ...(me?.lastReadAt ? { sentAt: { gt: me.lastReadAt } } : {}),
          },
        });
      }),
    );

    return conversations.map((conversation, index) => {
      const { messages, ...rest } = conversation;
      return {
        ...rest,
        lastMessage: messages[0] ? this.sanitizeMessage(messages[0]) : null,
        unreadCount: unreadCounts[index],
      };
    });
  }

  async create(
    workspaceId: string,
    caller: CallerMember,
    dto: CreateConversationDto,
  ) {
    if (dto.conversationType === ConversationType.PRIVATE) {
      return this.createPrivate(workspaceId, caller.id, dto.targetMemberId);
    }
    return this.createGroup(workspaceId, caller.id, dto);
  }

  private async createPrivate(
    workspaceId: string,
    memberId: string,
    targetMemberId?: string,
  ) {
    if (!targetMemberId) {
      throw new BadRequestException(
        'Chat 1-1 cần chỉ định thành viên muốn nhắn tin (targetMemberId)',
      );
    }
    if (targetMemberId === memberId) {
      throw new BadRequestException('Không thể tạo hội thoại với chính mình');
    }
    await this.assertActiveFamilyMembers(workspaceId, [targetMemberId]);

    const directKey = [memberId, targetMemberId].sort().join(':');
    const existing = await this.prisma.conversation.findUnique({
      where: { directKey },
      include: conversationInclude,
    });
    if (existing) {
      // Kích hoạt lại participant đã LEFT (mở lại hội thoại cũ).
      await this.prisma.conversationParticipant.updateMany({
        where: {
          conversationId: existing.conversationId,
          participantStatus: ParticipantStatus.LEFT,
        },
        data: { participantStatus: ParticipantStatus.ACTIVE, leftAt: null },
      });
      return this.getById(existing.conversationId);
    }

    try {
      const conversation = await this.prisma.conversation.create({
        data: {
          workspaceId,
          conversationType: ConversationType.PRIVATE,
          createdByMemberId: memberId,
          directKey,
          participants: {
            create: [{ memberId }, { memberId: targetMemberId }],
          },
        },
        include: conversationInclude,
      });
      this.notifyConversationCreated(workspaceId, conversation);
      return conversation;
    } catch (err) {
      // Race 2 request cùng tạo — unique directKey bắt, đọc lại.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return this.prisma.conversation.findUnique({
          where: { directKey },
          include: conversationInclude,
        });
      }
      throw err;
    }
  }

  private async createGroup(
    workspaceId: string,
    memberId: string,
    dto: CreateConversationDto,
  ) {
    if (!dto.conversationName?.trim()) {
      throw new BadRequestException('Nhóm chat cần có tên (conversationName)');
    }
    const memberIds = [...new Set(dto.memberIds ?? [])].filter(
      (id) => id !== memberId,
    );
    if (memberIds.length > 0) {
      await this.assertActiveFamilyMembers(workspaceId, memberIds);
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        workspaceId,
        conversationType: ConversationType.GROUP,
        conversationName: dto.conversationName.trim(),
        createdByMemberId: memberId,
        participants: {
          create: [memberId, ...memberIds].map((id) => ({ memberId: id })),
        },
      },
      include: conversationInclude,
    });
    this.notifyConversationCreated(workspaceId, conversation);
    return conversation;
  }

  async getOne(workspaceId: string, conversationId: string, memberId: string) {
    await this.getParticipantOrThrow(workspaceId, conversationId, memberId);
    return this.getById(conversationId);
  }

  async update(
    workspaceId: string,
    conversationId: string,
    caller: CallerMember,
    dto: UpdateConversationDto,
  ) {
    const { conversation } = await this.getParticipantOrThrow(
      workspaceId,
      conversationId,
      caller.id,
    );
    this.assertGroupManageable(conversation, caller, 'chỉnh sửa');

    const updated = await this.prisma.conversation.update({
      where: { conversationId },
      data: {
        ...(dto.conversationName !== undefined
          ? { conversationName: dto.conversationName.trim() }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: conversationInclude,
    });
    this.chatsGateway.emitConversationUpdated(conversationId, updated);
    return updated;
  }

  async addParticipants(
    workspaceId: string,
    conversationId: string,
    memberId: string,
    dto: AddParticipantsDto,
  ) {
    const { conversation } = await this.getParticipantOrThrow(
      workspaceId,
      conversationId,
      memberId,
    );
    if (conversation.conversationType !== ConversationType.GROUP) {
      throw new BadRequestException('Chat 1-1 không thể thêm thành viên');
    }
    if (conversation.isDefault) {
      throw new BadRequestException(
        'Nhóm chat chung tự đồng bộ mọi thành viên gia đình, không cần thêm thủ công',
      );
    }
    const memberIds = [...new Set(dto.memberIds)];
    await this.assertActiveFamilyMembers(workspaceId, memberIds);

    await this.prisma.$transaction([
      this.prisma.conversationParticipant.createMany({
        data: memberIds.map((id) => ({ conversationId, memberId: id })),
        skipDuplicates: true,
      }),
      this.prisma.conversationParticipant.updateMany({
        where: {
          conversationId,
          memberId: { in: memberIds },
          participantStatus: ParticipantStatus.LEFT,
        },
        data: { participantStatus: ParticipantStatus.ACTIVE, leftAt: null },
      }),
    ]);

    const updated = await this.getById(conversationId);
    if (updated) {
      // Join socket của thành viên mới vào room + báo cho cả room.
      this.notifyConversationCreated(workspaceId, updated);
      this.chatsGateway.emitConversationUpdated(conversationId, updated);
    }
    return updated;
  }

  async removeParticipant(
    workspaceId: string,
    conversationId: string,
    caller: CallerMember,
    targetMemberId: string,
  ) {
    const { conversation } = await this.getParticipantOrThrow(
      workspaceId,
      conversationId,
      caller.id,
    );
    if (targetMemberId === caller.id) {
      throw new BadRequestException(
        'Dùng chức năng rời nhóm để tự rời hội thoại',
      );
    }
    this.assertGroupManageable(conversation, caller, 'xóa thành viên khỏi');

    const removed = await this.prisma.conversationParticipant.updateMany({
      where: {
        conversationId,
        memberId: targetMemberId,
        participantStatus: ParticipantStatus.ACTIVE,
      },
      data: { participantStatus: ParticipantStatus.LEFT, leftAt: new Date() },
    });
    if (removed.count === 0) {
      throw new NotFoundException('Thành viên không ở trong hội thoại này');
    }

    await this.evictMemberSockets(conversationId, targetMemberId);
    const updated = await this.getById(conversationId);
    this.chatsGateway.emitConversationUpdated(conversationId, updated);
    return updated;
  }

  async leave(workspaceId: string, conversationId: string, memberId: string) {
    const { conversation } = await this.getParticipantOrThrow(
      workspaceId,
      conversationId,
      memberId,
    );
    if (conversation.isDefault) {
      throw new BadRequestException(
        'Không thể rời nhóm chat chung của gia đình',
      );
    }
    if (conversation.conversationType === ConversationType.PRIVATE) {
      throw new BadRequestException('Không thể rời hội thoại 1-1');
    }

    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, memberId },
      data: { participantStatus: ParticipantStatus.LEFT, leftAt: new Date() },
    });
    await this.evictMemberSockets(conversationId, memberId);
    const updated = await this.getById(conversationId);
    this.chatsGateway.emitConversationUpdated(conversationId, updated);
    return null;
  }

  async markRead(
    workspaceId: string,
    conversationId: string,
    memberId: string,
  ) {
    const { participant } = await this.getParticipantOrThrow(
      workspaceId,
      conversationId,
      memberId,
    );
    const lastReadAt = new Date();
    await this.prisma.conversationParticipant.update({
      where: { participantId: participant.participantId },
      data: { lastReadAt },
    });
    this.chatsGateway.emitRead(conversationId, {
      conversationId,
      memberId,
      lastReadAt,
    });
    return { conversationId, lastReadAt };
  }

  async listPinnedMessages(
    workspaceId: string,
    conversationId: string,
    memberId: string,
  ) {
    await this.getParticipantOrThrow(workspaceId, conversationId, memberId);
    return this.prisma.message.findMany({
      where: { conversationId, pinnedAt: { not: null }, deletedAt: null },
      include: {
        senderMember: memberSummary,
        pinnedByMember: memberSummary,
        attachments: true,
      },
      orderBy: { pinnedAt: 'desc' },
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getById(conversationId: string) {
    return this.prisma.conversation.findUnique({
      where: { conversationId },
      include: conversationInclude,
    });
  }

  /** Nhóm thường: creator hoặc FAMILY_MANAGER; nhóm default/PRIVATE: cấm. */
  private assertGroupManageable(
    conversation: {
      conversationType: ConversationType;
      isDefault: boolean;
      createdByMemberId: string;
    },
    caller: CallerMember,
    action: string,
  ): void {
    if (conversation.conversationType !== ConversationType.GROUP) {
      throw new BadRequestException(`Không thể ${action} hội thoại 1-1`);
    }
    if (conversation.isDefault) {
      throw new BadRequestException(
        `Không thể ${action} nhóm chat chung của gia đình`,
      );
    }
    if (
      conversation.createdByMemberId !== caller.id &&
      caller.familyRole !== FamilyRole.FAMILY_MANAGER
    ) {
      throw new ForbiddenException(
        `Chỉ người tạo nhóm hoặc quản lý gia đình mới được ${action} nhóm`,
      );
    }
  }

  /** Mọi memberId phải là thành viên ACTIVE của family. */
  private async assertActiveFamilyMembers(
    workspaceId: string,
    memberIds: string[],
  ): Promise<void> {
    const count = await this.prisma.familyMember.count({
      where: {
        id: { in: memberIds },
        familyId: workspaceId,
        status: MemberStatus.ACTIVE,
      },
    });
    if (count !== memberIds.length) {
      throw new BadRequestException(
        'Có thành viên không thuộc gia đình hoặc không còn hoạt động',
      );
    }
  }

  /** Tin đã thu hồi: ẩn nội dung trước khi trả ra client. */
  private sanitizeMessage<
    T extends { deletedAt: Date | null; content: string | null },
  >(message: T): T & { isDeleted: boolean } {
    if (!message.deletedAt) {
      return { ...message, isDeleted: false };
    }
    return { ...message, content: null, isDeleted: true };
  }

  /** Báo hội thoại mới + join socket online của participants vào room. */
  private notifyConversationCreated(
    workspaceId: string,
    conversation: {
      conversationId: string;
      participants: { member: { user: { id: string } } }[];
    },
  ): void {
    const userIds = conversation.participants.map((p) => p.member.user.id);
    this.chatsGateway.joinUsersToConversation(
      userIds,
      conversation.conversationId,
    );
    this.chatsGateway.emitConversationNew(conversation.conversationId, {
      workspaceId,
      conversation,
    });
  }

  private async evictMemberSockets(
    conversationId: string,
    memberId: string,
  ): Promise<void> {
    const member = await this.prisma.familyMember.findUnique({
      where: { id: memberId },
      select: { userId: true },
    });
    if (member) {
      this.chatsGateway.removeUserFromConversation(
        member.userId,
        conversationId,
      );
    }
  }
}
