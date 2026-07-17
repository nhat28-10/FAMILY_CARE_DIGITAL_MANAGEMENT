import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  ConversationStatus,
  FamilyRole,
  MessageType,
  NotificationPriority,
  NotificationType,
  ParticipantStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { StorageService } from '../../storage/storage.service';
import type { UploadedFilePayload } from '../../storage/storage.service';
import { ChatsGateway } from '../chats.gateway';
import { ConversationsService } from './conversations.service';
import type { CallerMember } from './conversations.service';
import type { EditMessageDto } from '../dto/edit-message.dto';
import type { ListMessagesQueryDto } from '../dto/list-messages-query.dto';
import type { ReactMessageDto } from '../dto/react-message.dto';
import type { SendMessageDto } from '../dto/send-message.dto';

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

const messageInclude = {
  senderMember: memberSummary,
  attachments: true,
  reactions: { include: { member: memberSummary } },
  pinnedByMember: memberSummary,
  replyTo: {
    include: { senderMember: memberSummary, attachments: true },
  },
} satisfies Prisma.MessageInclude;

type MessageWithInclude = Prisma.MessageGetPayload<{
  include: typeof messageInclude;
}>;

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

const MAX_CHAT_FILE_SIZE = 50 * 1024 * 1024;

/** Whitelist file đính kèm chat: mime → extension an toàn. */
const CHAT_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/zip': '.zip',
};

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
    private readonly storageService: StorageService,
    private readonly notificationsService: NotificationsService,
    // Gateway nhận `chat:send` gọi ngược service này — phá vòng phụ thuộc.
    @Inject(forwardRef(() => ChatsGateway))
    private readonly chatsGateway: ChatsGateway,
  ) {}

  // ---------------------------------------------------------------------------
  // Đọc lịch sử + tìm kiếm
  // ---------------------------------------------------------------------------

  async list(
    workspaceId: string,
    conversationId: string,
    memberId: string,
    query: ListMessagesQueryDto,
  ) {
    await this.conversationsService.getParticipantOrThrow(
      workspaceId,
      conversationId,
      memberId,
    );

    const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const search = query.q?.trim();
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        // Khi tìm kiếm: bỏ tin đã thu hồi; duyệt lịch sử bình thường vẫn trả
        // (đã ẩn nội dung) để client render "Tin nhắn đã bị thu hồi".
        ...(search
          ? {
              deletedAt: null,
              content: { contains: search, mode: 'insensitive' },
            }
          : {}),
      },
      include: messageInclude,
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = messages.length > limit;
    const items = (hasMore ? messages.slice(0, limit) : messages).map(
      (message) => this.sanitizeMessage(message),
    );
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Gửi / sửa / thu hồi
  // ---------------------------------------------------------------------------

  async send(
    workspaceId: string,
    conversationId: string,
    memberId: string,
    dto: SendMessageDto,
  ) {
    const { conversation } =
      await this.conversationsService.getParticipantOrThrow(
        workspaceId,
        conversationId,
        memberId,
      );
    if (conversation.status !== ConversationStatus.ACTIVE) {
      throw new BadRequestException(
        'Hội thoại đã được lưu trữ, không thể gửi tin',
      );
    }

    const content = dto.content?.trim();
    const attachments = dto.attachments ?? [];
    if (!content && attachments.length === 0) {
      throw new BadRequestException(
        'Tin nhắn cần có nội dung hoặc file đính kèm',
      );
    }

    if (dto.replyToMessageId) {
      const replyTo = await this.prisma.message.findFirst({
        where: {
          id: dto.replyToMessageId,
          conversationId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!replyTo) {
        throw new BadRequestException(
          'Tin nhắn được trả lời không tồn tại trong hội thoại này',
        );
      }
    }

    const messageType =
      dto.messageType ??
      (attachments.length > 0
        ? attachments[0].fileType.startsWith('image/')
          ? MessageType.IMAGE
          : MessageType.FILE
        : MessageType.TEXT);

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderMemberId: memberId,
          messageType,
          content: content ?? null,
          replyToMessageId: dto.replyToMessageId ?? null,
          attachments: {
            create: attachments.map((attachment) => ({
              fileType: attachment.fileType,
              fileUrl: attachment.fileUrl,
              fileName: attachment.fileName ?? null,
              fileSize: attachment.fileSize ?? null,
            })),
          },
        },
        include: messageInclude,
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: created.sentAt },
      });
      // Người gửi mặc nhiên đã đọc tới tin của chính mình.
      await tx.conversationParticipant.updateMany({
        where: { conversationId, memberId },
        data: { lastReadAt: created.sentAt },
      });
      return created;
    });

    const payload = this.sanitizeMessage(message);
    this.chatsGateway.emitMessageNew(conversationId, payload);

    // Tin nhắn đã gửi thành công — lỗi thông báo không được phép biến thao
    // tác đã thành công thành lỗi 5xx.
    try {
      const otherParticipants =
        await this.prisma.conversationParticipant.findMany({
          where: {
            conversationId,
            memberId: { not: memberId },
            participantStatus: ParticipantStatus.ACTIVE,
          },
          select: { member: { select: { userId: true, displayName: true } } },
        });
      const senderName =
        message.senderMember?.displayName ??
        message.senderMember?.user?.fullName ??
        'Tin nhắn mới';
      await this.notificationsService.notifyUsersEphemeral(
        otherParticipants.map((p) => p.member.userId),
        {
          familyId: workspaceId,
          type: NotificationType.CHAT,
          priority: NotificationPriority.NORMAL,
          title: senderName,
          body: content ?? '[Đính kèm]',
          referenceType: 'CONVERSATION',
          referenceId: conversationId,
        },
      );
    } catch (err) {
      this.logger.error(
        `Không thể gửi thông báo tin nhắn mới (conversation ${conversationId}): ${(err as Error).message}`,
      );
    }

    return payload;
  }

  async edit(
    workspaceId: string,
    conversationId: string,
    memberId: string,
    messageId: string,
    dto: EditMessageDto,
  ) {
    const message = await this.getMessageOrThrow(
      workspaceId,
      conversationId,
      memberId,
      messageId,
    );
    if (message.senderMemberId !== memberId) {
      throw new ForbiddenException('Chỉ người gửi mới được sửa tin nhắn');
    }
    if (message.deletedAt) {
      throw new BadRequestException('Tin nhắn đã bị thu hồi');
    }
    if (message.messageType !== MessageType.TEXT) {
      throw new BadRequestException('Chỉ tin nhắn văn bản mới sửa được');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: dto.content.trim(), editedAt: new Date() },
      include: messageInclude,
    });
    const payload = this.sanitizeMessage(updated);
    this.chatsGateway.emitMessageUpdated(conversationId, payload);
    return payload;
  }

  /** Thu hồi tin nhắn (soft delete). Người gửi hoặc FAMILY_MANAGER. */
  async remove(
    workspaceId: string,
    conversationId: string,
    caller: CallerMember,
    messageId: string,
  ) {
    const message = await this.getMessageOrThrow(
      workspaceId,
      conversationId,
      caller.id,
      messageId,
    );
    if (message.deletedAt) {
      throw new BadRequestException('Tin nhắn đã bị thu hồi trước đó');
    }
    if (
      message.senderMemberId !== caller.id &&
      caller.familyRole !== FamilyRole.FAMILY_MANAGER
    ) {
      throw new ForbiddenException(
        'Chỉ người gửi hoặc quản lý gia đình mới được thu hồi tin nhắn',
      );
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });
    this.chatsGateway.emitMessageDeleted(conversationId, {
      conversationId,
      messageId,
      deletedByMemberId: caller.id,
    });
    return null;
  }

  // ---------------------------------------------------------------------------
  // Reaction / pin
  // ---------------------------------------------------------------------------

  async react(
    workspaceId: string,
    conversationId: string,
    memberId: string,
    messageId: string,
    dto: ReactMessageDto,
  ) {
    const message = await this.getMessageOrThrow(
      workspaceId,
      conversationId,
      memberId,
      messageId,
    );
    if (message.deletedAt) {
      throw new BadRequestException(
        'Không thể thả cảm xúc cho tin nhắn đã thu hồi',
      );
    }

    await this.prisma.messageReaction.upsert({
      where: {
        messageId_memberId_emoji: { messageId, memberId, emoji: dto.emoji },
      },
      create: { messageId, memberId, emoji: dto.emoji },
      update: {},
    });
    return this.emitReactions(conversationId, messageId);
  }

  async unreact(
    workspaceId: string,
    conversationId: string,
    memberId: string,
    messageId: string,
    emoji: string,
  ) {
    await this.getMessageOrThrow(
      workspaceId,
      conversationId,
      memberId,
      messageId,
    );
    await this.prisma.messageReaction.deleteMany({
      where: { messageId, memberId, emoji },
    });
    return this.emitReactions(conversationId, messageId);
  }

  async pin(
    workspaceId: string,
    conversationId: string,
    memberId: string,
    messageId: string,
  ) {
    const message = await this.getMessageOrThrow(
      workspaceId,
      conversationId,
      memberId,
      messageId,
    );
    if (message.deletedAt) {
      throw new BadRequestException('Không thể ghim tin nhắn đã thu hồi');
    }
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { pinnedAt: new Date(), pinnedByMemberId: memberId },
      include: messageInclude,
    });
    const payload = this.sanitizeMessage(updated);
    this.chatsGateway.emitPinned(conversationId, { ...payload, pinned: true });
    return payload;
  }

  async unpin(
    workspaceId: string,
    conversationId: string,
    memberId: string,
    messageId: string,
  ) {
    await this.getMessageOrThrow(
      workspaceId,
      conversationId,
      memberId,
      messageId,
    );
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { pinnedAt: null, pinnedByMemberId: null },
      include: messageInclude,
    });
    const payload = this.sanitizeMessage(updated);
    this.chatsGateway.emitPinned(conversationId, { ...payload, pinned: false });
    return payload;
  }

  // ---------------------------------------------------------------------------
  // Upload file đính kèm
  // ---------------------------------------------------------------------------

  uploadAttachment(workspaceId: string, file: UploadedFilePayload | undefined) {
    return this.storageService.saveFile('chat-attachments', workspaceId, file, {
      allowedMimeToExt: CHAT_MIME_TO_EXT,
      maxSize: MAX_CHAT_FILE_SIZE,
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async getMessageOrThrow(
    workspaceId: string,
    conversationId: string,
    memberId: string,
    messageId: string,
  ) {
    await this.conversationsService.getParticipantOrThrow(
      workspaceId,
      conversationId,
      memberId,
    );
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
    });
    if (!message) {
      throw new NotFoundException('Không tìm thấy tin nhắn');
    }
    return message;
  }

  /** Gom reaction hiện tại của tin nhắn rồi phát cho room. */
  private async emitReactions(conversationId: string, messageId: string) {
    const reactions = await this.prisma.messageReaction.findMany({
      where: { messageId },
      include: { member: memberSummary },
      orderBy: { createdAt: 'asc' },
    });
    const payload = { conversationId, messageId, reactions };
    this.chatsGateway.emitReaction(conversationId, payload);
    return payload;
  }

  /** Tin đã thu hồi: ẩn nội dung + đính kèm trước khi trả ra client. */
  private sanitizeMessage(message: MessageWithInclude) {
    const replyTo = message.replyTo
      ? {
          ...message.replyTo,
          content: message.replyTo.deletedAt ? null : message.replyTo.content,
          attachments: message.replyTo.deletedAt
            ? []
            : message.replyTo.attachments,
          isDeleted: Boolean(message.replyTo.deletedAt),
        }
      : null;
    if (!message.deletedAt) {
      return { ...message, replyTo, isDeleted: false };
    }
    return {
      ...message,
      content: null,
      attachments: [],
      reactions: [],
      replyTo,
      isDeleted: true,
    };
  }
}
