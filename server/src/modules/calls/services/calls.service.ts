import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CallParticipantStatus,
  CallStatus,
  ConversationStatus,
  MemberStatus,
  MessageType,
  NotificationPriority,
  NotificationType,
  ParticipantStatus,
  Prisma,
} from '@prisma/client';
import type { WebhookEvent } from 'livekit-server-sdk';

import { PrismaService } from '../../../prisma/prisma.service';
import { ChatsGateway } from '../../chats/chats.gateway';
import { ConversationsService } from '../../chats/services/conversations.service';
import { NotificationsService } from '../../notifications/notifications.service';
import type { InitiateCallDto } from '../dto/initiate-call.dto';
import type { ListCallsQueryDto } from '../dto/list-calls-query.dto';
import { LiveKitService } from './livekit.service';

/** Projection gọn của member nhúng trong payload call (theo mẫu chat). */
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

const callInclude = {
  initiatedByMember: memberSummary,
  participants: { include: { member: memberSummary } },
} satisfies Prisma.CallInclude;

type CallWithInclude = Prisma.CallGetPayload<{ include: typeof callInclude }>;

const messageInclude = {
  senderMember: memberSummary,
  attachments: true,
  reactions: { include: { member: memberSummary } },
  pinnedByMember: memberSummary,
  replyTo: {
    include: { senderMember: memberSummary, attachments: true },
  },
} satisfies Prisma.MessageInclude;

const ENDED_STATUSES = new Set<CallStatus>([
  CallStatus.ENDED,
  CallStatus.MISSED,
  CallStatus.DECLINED,
  CallStatus.CANCELED,
]);

const ACTIVE_CALL_STATUSES: CallStatus[] = [
  CallStatus.RINGING,
  CallStatus.ONGOING,
];

/** Tối thiểu các field CallsService cần để finalize/summary một cuộc gọi. */
interface FinalizableCall {
  id: string;
  conversationId: string;
  initiatedByMemberId: string;
  roomName: string;
  startedAt: Date;
  connectedAt: Date | null;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
    private readonly notificationsService: NotificationsService,
    private readonly liveKitService: LiveKitService,
    private readonly chatsGateway: ChatsGateway,
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async initiate(userId: string, dto: InitiateCallDto) {
    const { conversation, member } = await this.resolveCaller(
      dto.conversationId,
      userId,
    );
    if (conversation.status !== ConversationStatus.ACTIVE) {
      throw new BadRequestException('Hội thoại đã được lưu trữ, không thể gọi');
    }

    const existing = await this.prisma.call.findFirst({
      where: {
        conversationId: conversation.id,
        status: { in: ACTIVE_CALL_STATUSES },
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        'Đang có cuộc gọi diễn ra trong hội thoại này',
      );
    }

    const activeParticipants =
      await this.prisma.conversationParticipant.findMany({
        where: {
          conversationId: conversation.id,
          participantStatus: ParticipantStatus.ACTIVE,
        },
        select: {
          memberId: true,
          member: { select: { userId: true } },
        },
      });
    if (activeParticipants.length < 2) {
      throw new BadRequestException(
        'Hội thoại cần ít nhất 2 thành viên để gọi',
      );
    }

    const roomName = `call-${randomUUID()}`;
    const call = await this.prisma.call.create({
      data: {
        conversationId: conversation.id,
        initiatedByMemberId: member.id,
        roomName,
        participants: {
          create: activeParticipants.map((p) => ({ memberId: p.memberId })),
        },
      },
      include: callInclude,
    });

    const callerName = this.displayNameOf(member);
    const token = await this.liveKitService.createToken(
      roomName,
      member.id,
      callerName,
    );

    this.chatsGateway.emitCallIncoming(conversation.id, {
      callId: call.id,
      conversationId: conversation.id,
      roomName,
      initiatedByMemberId: member.id,
      callerName,
      participants: call.participants,
    });

    const calleeUserIds = activeParticipants
      .filter((p) => p.memberId !== member.id)
      .map((p) => p.member.userId);
    try {
      await this.notificationsService.notifyUsersEphemeral(calleeUserIds, {
        familyId: conversation.workspaceId,
        type: NotificationType.CALL,
        priority: NotificationPriority.HIGH,
        title: callerName,
        body: 'Cuộc gọi video đến',
        referenceType: 'CALL',
        referenceId: call.id,
      });
    } catch (err) {
      this.logger.error(
        `Không thể gửi thông báo cuộc gọi đến (call ${call.id}): ${(err as Error).message}`,
      );
    }

    return {
      callId: call.id,
      roomName,
      token,
      livekitUrl: this.liveKitService.url,
      call,
    };
  }

  async join(userId: string, callId: string) {
    const call = await this.getCallOrThrow(callId);
    const { member } = await this.resolveCaller(call.conversationId, userId);
    this.assertCallJoinable(call);

    const participant = await this.prisma.callParticipant.findUnique({
      where: { callId_memberId: { callId, memberId: member.id } },
    });
    if (!participant) {
      throw new ForbiddenException('Bạn không được mời vào cuộc gọi này');
    }

    const callerName = this.displayNameOf(member);
    const token = await this.liveKitService.createToken(
      call.roomName,
      member.id,
      callerName,
    );
    return {
      callId: call.id,
      roomName: call.roomName,
      token,
      livekitUrl: this.liveKitService.url,
    };
  }

  async decline(userId: string, callId: string) {
    const call = await this.getCallOrThrow(callId);
    const { member } = await this.resolveCaller(call.conversationId, userId);

    const participant = await this.prisma.callParticipant.findUnique({
      where: { callId_memberId: { callId, memberId: member.id } },
    });
    if (!participant) {
      throw new ForbiddenException('Bạn không được mời vào cuộc gọi này');
    }
    if (participant.status !== CallParticipantStatus.INVITED) {
      return { callId };
    }

    await this.prisma.callParticipant.update({
      where: { id: participant.id },
      data: { status: CallParticipantStatus.DECLINED },
    });
    this.chatsGateway.emitCallDeclined(call.conversationId, {
      callId,
      memberId: member.id,
    });

    // Chưa từng có ai join + không còn ai chờ phản hồi → tự kết thúc cuộc gọi.
    if (!call.connectedAt) {
      const stillPending = await this.prisma.callParticipant.count({
        where: {
          callId,
          memberId: { not: call.initiatedByMemberId },
          status: CallParticipantStatus.INVITED,
        },
      });
      if (stillPending === 0) {
        await this.finalizeCall(call, CallStatus.DECLINED, 'declined');
      }
    }
    return { callId };
  }

  async leave(userId: string, callId: string) {
    const call = await this.getCallOrThrow(callId);
    const { member } = await this.resolveCaller(call.conversationId, userId);

    const participant = await this.prisma.callParticipant.findUnique({
      where: { callId_memberId: { callId, memberId: member.id } },
    });
    if (!participant) {
      throw new ForbiddenException('Bạn không ở trong cuộc gọi này');
    }
    if (participant.status === CallParticipantStatus.JOINED) {
      await this.prisma.callParticipant.update({
        where: { id: participant.id },
        data: { status: CallParticipantStatus.LEFT, leftAt: new Date() },
      });
      this.chatsGateway.emitCallParticipantUpdate(call.conversationId, {
        callId,
        memberId: member.id,
        status: CallParticipantStatus.LEFT,
      });
    }

    if (call.status === CallStatus.ONGOING) {
      const remainingJoined = await this.prisma.callParticipant.count({
        where: { callId, status: CallParticipantStatus.JOINED },
      });
      if (remainingJoined === 0) {
        await this.finalizeCall(call, CallStatus.ENDED, 'all_left');
      }
    }
    return { callId };
  }

  async end(userId: string, callId: string) {
    const call = await this.getCallOrThrow(callId);
    const { member } = await this.resolveCaller(call.conversationId, userId);
    if (member.id !== call.initiatedByMemberId) {
      throw new ForbiddenException(
        'Chỉ người khởi tạo mới được kết thúc cuộc gọi cho tất cả',
      );
    }
    if (ENDED_STATUSES.has(call.status)) {
      return { callId };
    }
    const status = call.connectedAt ? CallStatus.ENDED : CallStatus.CANCELED;
    await this.finalizeCall(call, status, 'hangup');
    return { callId };
  }

  async listHistory(
    userId: string,
    conversationId: string,
    query: ListCallsQueryDto,
  ) {
    const { conversation } = await this.resolveCaller(conversationId, userId);
    const limit = Math.min(query.limit ?? 30, 100);

    const calls = await this.prisma.call.findMany({
      where: { conversationId: conversation.id },
      include: callInclude,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = calls.length > limit;
    const items = hasMore ? calls.slice(0, limit) : calls;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Webhook LiveKit — nguồn sự thật cho trạng thái "ai thực sự đang trong phòng".
  // ---------------------------------------------------------------------------

  async handleWebhookEvent(event: WebhookEvent): Promise<void> {
    switch (event.event) {
      case 'participant_joined':
        await this.handleParticipantJoined(event);
        break;
      case 'participant_left':
        await this.handleParticipantLeft(event);
        break;
      case 'room_finished':
        await this.handleRoomFinished(event);
        break;
      default:
        break;
    }
  }

  private async handleParticipantJoined(event: WebhookEvent): Promise<void> {
    const roomName = event.room?.name;
    const memberId = event.participant?.identity;
    if (!roomName || !memberId) {
      return;
    }
    const call = await this.prisma.call.findUnique({ where: { roomName } });
    if (!call || ENDED_STATUSES.has(call.status)) {
      return;
    }
    const participant = await this.prisma.callParticipant.findUnique({
      where: { callId_memberId: { callId: call.id, memberId } },
    });
    if (!participant) {
      return;
    }

    const now = new Date();
    const wasRinging = call.status === CallStatus.RINGING;
    await this.prisma.$transaction([
      this.prisma.callParticipant.update({
        where: { id: participant.id },
        data: {
          status: CallParticipantStatus.JOINED,
          joinedAt: participant.joinedAt ?? now,
        },
      }),
      ...(wasRinging
        ? [
            this.prisma.call.update({
              where: { id: call.id },
              data: { status: CallStatus.ONGOING, connectedAt: now },
            }),
          ]
        : []),
    ]);

    this.chatsGateway.emitCallParticipantUpdate(call.conversationId, {
      callId: call.id,
      memberId,
      status: CallParticipantStatus.JOINED,
    });
    if (wasRinging) {
      this.chatsGateway.emitCallAccepted(call.conversationId, {
        callId: call.id,
        memberId,
      });
    }
  }

  private async handleParticipantLeft(event: WebhookEvent): Promise<void> {
    const roomName = event.room?.name;
    const memberId = event.participant?.identity;
    if (!roomName || !memberId) {
      return;
    }
    const call = await this.prisma.call.findUnique({ where: { roomName } });
    if (!call || call.status !== CallStatus.ONGOING) {
      return;
    }

    const participant = await this.prisma.callParticipant.findUnique({
      where: { callId_memberId: { callId: call.id, memberId } },
    });
    if (participant?.status === CallParticipantStatus.JOINED) {
      await this.prisma.callParticipant.update({
        where: { id: participant.id },
        data: { status: CallParticipantStatus.LEFT, leftAt: new Date() },
      });
      this.chatsGateway.emitCallParticipantUpdate(call.conversationId, {
        callId: call.id,
        memberId,
        status: CallParticipantStatus.LEFT,
      });
    }

    const remainingJoined = await this.prisma.callParticipant.count({
      where: { callId: call.id, status: CallParticipantStatus.JOINED },
    });
    if (remainingJoined === 0) {
      await this.finalizeCall(call, CallStatus.ENDED, 'all_left');
    }
  }

  private async handleRoomFinished(event: WebhookEvent): Promise<void> {
    const roomName = event.room?.name;
    if (!roomName) {
      return;
    }
    const call = await this.prisma.call.findUnique({ where: { roomName } });
    if (!call || ENDED_STATUSES.has(call.status)) {
      return;
    }
    await this.finalizeCall(call, CallStatus.ENDED, 'timeout');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Kết thúc call: cập nhật status + ghi Message CALL trong 1 transaction. */
  private async finalizeCall(
    call: FinalizableCall,
    status: CallStatus,
    endedReason: string,
  ): Promise<void> {
    const endedAt = new Date();
    const content = this.buildCallSummary(
      status,
      call.connectedAt,
      call.startedAt,
      endedAt,
    );

    const message = await this.prisma.$transaction(async (tx) => {
      await tx.call.update({
        where: { id: call.id },
        data: { status, endedAt, endedReason },
      });
      const created = await tx.message.create({
        data: {
          conversationId: call.conversationId,
          senderMemberId: call.initiatedByMemberId,
          messageType: MessageType.CALL,
          relatedCallId: call.id,
          content,
        },
        include: messageInclude,
      });
      await tx.conversation.update({
        where: { id: call.conversationId },
        data: { lastMessageAt: created.sentAt },
      });
      return created;
    });

    this.chatsGateway.emitMessageNew(call.conversationId, {
      ...message,
      isDeleted: false,
    });
    this.chatsGateway.emitCallEnded(call.conversationId, {
      callId: call.id,
      status,
      endedReason,
      endedAt,
    });

    void this.liveKitService.closeRoom(call.roomName).catch(() => undefined);
  }

  private buildCallSummary(
    status: CallStatus,
    connectedAt: Date | null,
    startedAt: Date,
    endedAt: Date,
  ): string {
    if (status === CallStatus.DECLINED) {
      return 'Cuộc gọi bị từ chối';
    }
    if (status === CallStatus.CANCELED) {
      return 'Cuộc gọi đã hủy';
    }
    if (status === CallStatus.MISSED) {
      return 'Cuộc gọi nhỡ';
    }
    const ms = endedAt.getTime() - (connectedAt ?? startedAt).getTime();
    return `Cuộc gọi video · ${formatDuration(ms)}`;
  }

  private assertCallJoinable(call: { status: CallStatus }): void {
    if (ENDED_STATUSES.has(call.status)) {
      throw new BadRequestException('Cuộc gọi đã kết thúc');
    }
  }

  private async getCallOrThrow(callId: string): Promise<CallWithInclude> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: callInclude,
    });
    if (!call) {
      throw new NotFoundException('Không tìm thấy cuộc gọi');
    }
    return call;
  }

  /** Verify conversation tồn tại + caller là member ACTIVE + participant ACTIVE. */
  private async resolveCaller(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException('Không tìm thấy hội thoại');
    }
    const member = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: { familyId: conversation.workspaceId, userId },
      },
      select: {
        id: true,
        displayName: true,
        status: true,
        userId: true,
        user: { select: { fullName: true } },
      },
    });
    if (!member || member.status !== MemberStatus.ACTIVE) {
      throw new ForbiddenException(
        'Bạn không thuộc gia đình của hội thoại này',
      );
    }
    const { participant } =
      await this.conversationsService.getParticipantOrThrow(
        conversation.workspaceId,
        conversationId,
        member.id,
      );
    return { conversation, member, participant };
  }

  private displayNameOf(member: {
    displayName: string | null;
    user: { fullName: string | null };
  }): string {
    return member.displayName ?? member.user.fullName ?? 'Thành viên';
  }
}
