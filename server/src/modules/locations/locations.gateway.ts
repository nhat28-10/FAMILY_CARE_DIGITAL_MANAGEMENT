import { Logger } from '@nestjs/common';
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

const WS_CORS_ORIGINS = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

interface LocationSocketData {
  userId?: string;
}

@WebSocketGateway({
  namespace: '/locations',
  cors: {
    origin: WS_CORS_ORIGINS.length > 0 ? WS_CORS_ORIGINS : true,
    credentials: true,
  },
})
export class LocationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(LocationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly familyMembersService: FamilyMembersService,
  ) {}

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

      (client.data as LocationSocketData).userId = user.id;
      this.logger.debug(
        `Location socket connected ${client.id} (user ${user.id})`,
      );
    } catch (err) {
      this.logger.warn(
        `Từ chối location socket ${client.id}: ${(err as Error).message}`,
      );
      client.emit('location:error', { message: 'Xác thực thất bại' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Location socket disconnected ${client.id}`);
  }

  @SubscribeMessage('location:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { workspaceId?: string },
  ): Promise<{ joined: boolean; workspaceId?: string; error?: string }> {
    const userId = (client.data as LocationSocketData)?.userId;
    if (!userId) {
      return { joined: false, error: 'Chưa xác thực' };
    }

    const workspaceId = body?.workspaceId;
    if (!workspaceId) {
      client.emit('location:error', { message: 'Thiếu workspaceId' });
      return { joined: false, error: 'Thiếu workspaceId' };
    }

    const membership = await this.familyMembersService.findByFamilyAndUser(
      workspaceId,
      userId,
    );
    if (!membership) {
      client.emit('location:error', {
        message: 'Bạn không thuộc workspace này',
      });
      return { joined: false, error: 'Không phải thành viên' };
    }

    await client.join(this.room(workspaceId));
    return { joined: true, workspaceId };
  }

  @SubscribeMessage('location:leave')
  async handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { workspaceId?: string },
  ): Promise<{ left: boolean; workspaceId?: string }> {
    if (body?.workspaceId) {
      await client.leave(this.room(body.workspaceId));
    }
    return { left: true, workspaceId: body?.workspaceId };
  }

  emitLocationUpdated(workspaceId: string, payload: unknown): void {
    this.server.to(this.room(workspaceId)).emit('location:updated', payload);
  }

  emitSharingChanged(workspaceId: string, payload: unknown): void {
    this.server
      .to(this.room(workspaceId))
      .emit('location:sharing_changed', payload);
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

  private room(workspaceId: string): string {
    return `workspace:${workspaceId}`;
  }
}
