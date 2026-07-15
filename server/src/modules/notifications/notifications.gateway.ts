import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { authenticateSocket } from '../../common/ws/ws-auth.util';
import { UsersService } from '../users/users.service';

const WS_CORS_ORIGINS = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/**
 * Kênh realtime notification cá nhân (namespace `/notifications`).
 * Connect thành công → tự join room `user:<userId>`; không có message join thủ công.
 */
@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: WS_CORS_ORIGINS.length > 0 ? WS_CORS_ORIGINS : true,
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const userId = await authenticateSocket(client, {
        jwtService: this.jwtService,
        config: this.config,
        usersService: this.usersService,
      });
      (client.data as { userId?: string }).userId = userId;
      await client.join(this.userRoom(userId));
    } catch (err) {
      this.logger.warn(
        `Từ chối notification socket ${client.id}: ${(err as Error).message}`,
      );
      client.emit('notification:error', { message: 'Xác thực thất bại' });
      client.disconnect(true);
    }
  }

  /** Worker/channel gọi để đẩy event tới từng user (mọi thiết bị đang mở). */
  emitToUsers(userIds: string[], event: string, payload: unknown): void {
    for (const userId of new Set(userIds)) {
      this.server.to(this.userRoom(userId)).emit(event, payload);
    }
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }
}
