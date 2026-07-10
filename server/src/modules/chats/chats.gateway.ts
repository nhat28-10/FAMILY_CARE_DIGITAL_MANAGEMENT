import { Inject, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { AccountStatus } from '@prisma/client';
import type { Server, Socket } from 'socket.io';

import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { FamilyMembersService } from '../family-members/family-members.service';
import { UsersService } from '../users/users.service';
import { ConversationsService } from './services/conversations.service';
import { MessagesService } from './services/messages.service';
import type { SendMessageDto } from './dto/send-message.dto';

/** Payload gửi tin qua socket (đường ghi độ trễ thấp, tương đương POST messages). */
interface ChatSendBody extends SendMessageDto {
  workspaceId?: string;
  conversationId?: string;
}

// CORS origins resolved at module load (mirrors config `cors.origins`).
const WS_CORS_ORIGINS = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/** Data gắn vào socket sau khi xác thực. */
interface ChatSocketData {
  userId?: string;
  /** Các workspace room đã join — để phát presence offline khi disconnect. */
  joinedWorkspaces?: Set<string>;
}

/**
 * Realtime chat (Socket.IO, namespace `/chat`) — theo mẫu SosGateway.
 *
 * - Handshake: JWT access token (handshake.auth.token hoặc `Authorization: Bearer`),
 *   user phải tồn tại + ACTIVE.
 * - `chat:join` một workspace: verify membership, join room `workspace:<id>` và
 *   toàn bộ room `conversation:<id>` member đang tham gia (nhận tin mới của mọi
 *   hội thoại để cập nhật badge), kèm presence online/offline.
 * - Service gọi các `emit*` sau khi ghi DB thành công.
 */
@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: WS_CORS_ORIGINS.length > 0 ? WS_CORS_ORIGINS : true,
    credentials: true,
  },
})
export class ChatsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatsGateway.name);

  @WebSocketServer()
  server!: Server;

  /** userId -> set of live socket ids (targeted join/leave room, emit riêng). */
  private readonly userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly familyMembersService: FamilyMembersService,
    // Services cũng gọi ngược gateway (emit*) — phá vòng phụ thuộc.
    @Inject(forwardRef(() => ConversationsService))
    private readonly conversationsService: ConversationsService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messagesService: MessagesService,
  ) {}

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        throw new Error('Thiếu token');
      }

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user || user.accountStatus !== AccountStatus.ACTIVE) {
        throw new Error('Tài khoản không hợp lệ');
      }

      const data = client.data as ChatSocketData;
      data.userId = user.id;
      data.joinedWorkspaces = new Set();
      this.track(user.id, client.id);
      this.logger.debug(`Chat socket connected ${client.id} (user ${user.id})`);
    } catch (err) {
      this.logger.warn(
        `Từ chối chat socket ${client.id}: ${(err as Error).message}`,
      );
      client.emit('chat:error', { message: 'Xác thực thất bại' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const data = client.data as ChatSocketData;
    const userId = data?.userId;
    if (!userId) {
      return;
    }
    const sockets = this.userSockets.get(userId);
    sockets?.delete(client.id);
    if (sockets && sockets.size === 0) {
      this.userSockets.delete(userId);
    }
    // Hết socket của user trong workspace room → báo offline cho room đó.
    for (const workspaceId of data.joinedWorkspaces ?? []) {
      const stillOnline = await this.isUserInRoom(
        userId,
        this.workspaceRoom(workspaceId),
      );
      if (!stillOnline) {
        this.server
          .to(this.workspaceRoom(workspaceId))
          .emit('chat:presence', { workspaceId, userId, online: false });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Client → server
  // ---------------------------------------------------------------------------

  @SubscribeMessage('chat:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { workspaceId?: string },
  ): Promise<{
    joined: boolean;
    workspaceId?: string;
    onlineUserIds?: string[];
    error?: string;
  }> {
    const data = client.data as ChatSocketData;
    const userId = data?.userId;
    if (!userId) {
      return { joined: false, error: 'Chưa xác thực' };
    }
    const workspaceId = body?.workspaceId;
    if (!workspaceId) {
      return { joined: false, error: 'Thiếu workspaceId' };
    }

    const membership = await this.familyMembersService.findByFamilyAndUser(
      workspaceId,
      userId,
    );
    if (!membership) {
      return { joined: false, error: 'Bạn không thuộc workspace này' };
    }

    const room = this.workspaceRoom(workspaceId);
    const wasOnline = await this.isUserInRoom(userId, room);
    await client.join(room);
    data.joinedWorkspaces?.add(workspaceId);

    // Join mọi hội thoại member đang tham gia — nhận tin mới của tất cả để đếm badge.
    const conversationIds =
      await this.conversationsService.listConversationIdsForMember(
        workspaceId,
        membership.id,
      );
    for (const id of conversationIds) {
      await client.join(this.conversationRoom(id));
    }

    // Presence: báo online (nếu là socket đầu tiên) + trả danh sách đang online.
    if (!wasOnline) {
      client
        .to(room)
        .emit('chat:presence', { workspaceId, userId, online: true });
    }
    const onlineUserIds = await this.listOnlineUserIds(room);
    return { joined: true, workspaceId, onlineUserIds };
  }

  @SubscribeMessage('chat:leave')
  async handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { workspaceId?: string },
  ): Promise<{ left: boolean; workspaceId?: string }> {
    const data = client.data as ChatSocketData;
    const workspaceId = body?.workspaceId;
    if (!workspaceId) {
      return { left: true };
    }
    await client.leave(this.workspaceRoom(workspaceId));
    data?.joinedWorkspaces?.delete(workspaceId);
    // Rời các room hội thoại của workspace này (nếu user còn ở workspace khác
    // thì các room đó thuộc workspace khác, không đụng).
    if (data?.userId) {
      const membership = await this.familyMembersService.findByFamilyAndUser(
        workspaceId,
        data.userId,
      );
      if (membership) {
        const conversationIds =
          await this.conversationsService.listConversationIdsForMember(
            workspaceId,
            membership.id,
          );
        for (const id of conversationIds) {
          await client.leave(this.conversationRoom(id));
        }
      }
      const stillOnline = await this.isUserInRoom(
        data.userId,
        this.workspaceRoom(workspaceId),
      );
      if (!stillOnline) {
        this.server.to(this.workspaceRoom(workspaceId)).emit('chat:presence', {
          workspaceId,
          userId: data.userId,
          online: false,
        });
      }
    }
    return { left: true, workspaceId };
  }

  /** Typing indicator — thuần realtime, không ghi DB. */
  @SubscribeMessage('chat:typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string; isTyping?: boolean },
  ): { ok: boolean } {
    const userId = (client.data as ChatSocketData)?.userId;
    const conversationId = body?.conversationId;
    if (!userId || !conversationId) {
      return { ok: false };
    }
    const room = this.conversationRoom(conversationId);
    // Chỉ người đã ở trong room hội thoại mới được phát typing.
    if (!client.rooms.has(room)) {
      return { ok: false };
    }
    client.to(room).emit('chat:typing', {
      conversationId,
      userId,
      isTyping: Boolean(body?.isTyping),
    });
    return { ok: true };
  }

  /**
   * Gửi tin qua socket — độ trễ thấp hơn HTTP cho mobile (như `sos:location:push`).
   * Dùng chung `MessagesService.send` với REST nên mọi kiểm tra quyền giữ nguyên.
   */
  @SubscribeMessage('chat:send')
  async handleSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: ChatSendBody,
  ): Promise<{ ok: boolean; message?: unknown; error?: string }> {
    const userId = (client.data as ChatSocketData)?.userId;
    if (!userId) {
      return { ok: false, error: 'Chưa xác thực' };
    }
    const { workspaceId, conversationId, ...dto } = body ?? {};
    if (!workspaceId || !conversationId) {
      return { ok: false, error: 'Thiếu workspaceId hoặc conversationId' };
    }
    const membership = await this.familyMembersService.findByFamilyAndUser(
      workspaceId,
      userId,
    );
    if (!membership) {
      return { ok: false, error: 'Bạn không thuộc workspace này' };
    }
    try {
      const message = await this.messagesService.send(
        workspaceId,
        conversationId,
        membership.id,
        dto,
      );
      return { ok: true, message };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  // ---------------------------------------------------------------------------
  // Emit API — service gọi sau khi ghi DB thành công.
  // ---------------------------------------------------------------------------

  emitMessageNew(conversationId: string, payload: unknown): void {
    this.toConversation(conversationId, 'chat:message:new', payload);
  }

  emitMessageUpdated(conversationId: string, payload: unknown): void {
    this.toConversation(conversationId, 'chat:message:updated', payload);
  }

  emitMessageDeleted(conversationId: string, payload: unknown): void {
    this.toConversation(conversationId, 'chat:message:deleted', payload);
  }

  emitReaction(conversationId: string, payload: unknown): void {
    this.toConversation(conversationId, 'chat:reaction', payload);
  }

  emitRead(conversationId: string, payload: unknown): void {
    this.toConversation(conversationId, 'chat:read', payload);
  }

  emitPinned(conversationId: string, payload: unknown): void {
    this.toConversation(conversationId, 'chat:pinned', payload);
  }

  emitConversationNew(conversationId: string, payload: unknown): void {
    this.toConversation(conversationId, 'chat:conversation:new', payload);
  }

  emitConversationUpdated(conversationId: string, payload: unknown): void {
    this.toConversation(conversationId, 'chat:conversation:updated', payload);
  }

  /** Join socket online của các user vào room hội thoại (hội thoại mới/thêm member). */
  joinUsersToConversation(userIds: string[], conversationId: string): void {
    const room = this.conversationRoom(conversationId);
    for (const userId of userIds) {
      const sockets = this.userSockets.get(userId);
      if (!sockets) {
        continue;
      }
      for (const socketId of sockets) {
        this.server.in(socketId).socketsJoin(room);
      }
    }
  }

  /** Đưa mọi socket của user ra khỏi room hội thoại (bị xóa / rời nhóm). */
  removeUserFromConversation(userId: string, conversationId: string): void {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) {
      return;
    }
    const room = this.conversationRoom(conversationId);
    for (const socketId of sockets) {
      this.server.in(socketId).socketsLeave(room);
      this.server
        .to(socketId)
        .emit('chat:conversation:removed', { conversationId });
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toConversation(
    conversationId: string,
    event: string,
    payload: unknown,
  ): void {
    this.server.to(this.conversationRoom(conversationId)).emit(event, payload);
  }

  private async isUserInRoom(userId: string, room: string): Promise<boolean> {
    const sockets = await this.server.in(room).fetchSockets();
    return sockets.some(
      (socket) => (socket.data as ChatSocketData)?.userId === userId,
    );
  }

  private async listOnlineUserIds(room: string): Promise<string[]> {
    const sockets = await this.server.in(room).fetchSockets();
    const userIds = new Set<string>();
    for (const socket of sockets) {
      const userId = (socket.data as ChatSocketData)?.userId;
      if (userId) {
        userIds.add(userId);
      }
    }
    return [...userIds];
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) {
      return authToken.replace(/^Bearer\s+/i, '');
    }
    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7);
    }
    return undefined;
  }

  private track(userId: string, socketId: string): void {
    const sockets = this.userSockets.get(userId) ?? new Set<string>();
    sockets.add(socketId);
    this.userSockets.set(userId, sockets);
  }

  private workspaceRoom(workspaceId: string): string {
    return `workspace:${workspaceId}`;
  }

  private conversationRoom(conversationId: string): string {
    return `conversation:${conversationId}`;
  }
}
