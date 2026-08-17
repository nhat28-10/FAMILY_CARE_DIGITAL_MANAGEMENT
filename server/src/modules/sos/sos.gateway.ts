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
import { AccountStatus, GpsSourceType } from '@prisma/client';
import type { Server, Socket } from 'socket.io';

import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { FamilyMembersService } from '../family-members/family-members.service';
import { UsersService } from '../users/users.service';
import { SosService } from './services/sos.service';

/** Inbound payload for a device streaming a live GPS point over the socket. */
interface LocationPushBody {
  workspaceId?: string;
  alertId?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  sourceType?: GpsSourceType;
  recordedAt?: string;
  deviceId?: string;
}

// CORS origins resolved at module load (mirrors config `cors.origins`).
const WS_CORS_ORIGINS = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/** Data attached to an authenticated SOS socket after handshake. */
interface SosSocketData {
  userId?: string;
}

/**
 * Realtime SOS channel (Socket.IO, namespace `/sos`).
 *
 * - Handshake auth mirrors the HTTP layer: a JWT access token (handshake.auth
 *   .token or `Authorization: Bearer`) is verified with the same access secret,
 *   then the user must exist and be ACTIVE.
 * - Clients explicitly `sos:join` a workspace room; membership is enforced.
 * - `SosService` calls the `emit*` methods to broadcast to a workspace room.
 */
@WebSocketGateway({
  namespace: '/sos',
  cors: {
    origin: WS_CORS_ORIGINS.length > 0 ? WS_CORS_ORIGINS : true,
    credentials: true,
  },
})
export class SosGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SosGateway.name);

  @WebSocketServer()
  server!: Server;

  /** userId -> set of live socket ids (for targeted room-leave / kick). */
  private readonly userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly familyMembersService: FamilyMembersService,
    // SosService also depends on this gateway (emit*) — break the cycle.
    @Inject(forwardRef(() => SosService))
    private readonly sosService: SosService,
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

      (client.data as SosSocketData).userId = user.id;
      this.track(user.id, client.id);
      this.logger.debug(`SOS socket connected ${client.id} (user ${user.id})`);
    } catch (err) {
      this.logger.warn(
        `Từ chối SOS socket ${client.id}: ${(err as Error).message}`,
      );
      client.emit('sos:error', { message: 'Xác thực thất bại' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = (client.data as SosSocketData)?.userId;
    if (!userId) {
      return;
    }
    const sockets = this.userSockets.get(userId);
    sockets?.delete(client.id);
    if (sockets && sockets.size === 0) {
      this.userSockets.delete(userId);
    }
  }

  @SubscribeMessage('sos:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { workspaceId?: string },
  ): Promise<{ joined: boolean; workspaceId?: string; error?: string }> {
    const userId = (client.data as SosSocketData)?.userId;
    if (!userId) {
      return { joined: false, error: 'Chưa xác thực' };
    }

    const workspaceId = body?.workspaceId;
    if (!workspaceId) {
      client.emit('sos:error', { message: 'Thiếu workspaceId' });
      return { joined: false, error: 'Thiếu workspaceId' };
    }

    const membership = await this.familyMembersService.findByFamilyAndUser(
      workspaceId,
      userId,
    );
    if (!membership) {
      client.emit('sos:error', { message: 'Bạn không thuộc workspace này' });
      return { joined: false, error: 'Không phải thành viên' };
    }

    await client.join(this.room(workspaceId));

    // Hand the newcomer the live situation immediately (Messenger-style): the
    // active alert + last-known position, so their map renders without waiting
    // for the next streamed point.
    const snapshot =
      await this.sosService.getActiveAlertForWorkspace(workspaceId);
    if (snapshot) {
      client.emit('sos:snapshot', snapshot);
    }

    return { joined: true, workspaceId };
  }

  /**
   * Live GPS ingest over the socket — lower latency than the HTTP endpoint for
   * continuous streaming. Only the member who triggered the alert may push
   * (enforced inside `SosService.pushLocation`), which also broadcasts the
   * point to the workspace room.
   */
  @SubscribeMessage('sos:location:push')
  async handleLocationPush(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: LocationPushBody,
  ): Promise<{ ok: boolean; error?: string }> {
    const userId = (client.data as SosSocketData)?.userId;
    if (!userId) {
      return { ok: false, error: 'Chưa xác thực' };
    }

    const { workspaceId, alertId } = body ?? {};
    if (!workspaceId || !alertId) {
      return { ok: false, error: 'Thiếu workspaceId hoặc alertId' };
    }
    if (!this.isValidCoord(body.latitude, body.longitude)) {
      return { ok: false, error: 'Toạ độ không hợp lệ' };
    }

    const membership = await this.familyMembersService.findByFamilyAndUser(
      workspaceId,
      userId,
    );
    if (!membership) {
      return { ok: false, error: 'Không phải thành viên' };
    }

    try {
      await this.sosService.pushLocation(workspaceId, alertId, membership.id, {
        latitude: body.latitude as number,
        longitude: body.longitude as number,
        accuracy: body.accuracy,
        sourceType: body.sourceType ?? GpsSourceType.MOBILE_GPS,
        recordedAt: body.recordedAt,
        deviceId: body.deviceId,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * A responder who explicitly tapped ON_THE_WAY can stream their own location
   * so the SOS trigger sees who is coming. This is opt-in per alert and is
   * separate from the trigger's own `sos:location` route.
   */
  @SubscribeMessage('sos:responder:location:push')
  async handleResponderLocationPush(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: LocationPushBody,
  ): Promise<{ ok: boolean; error?: string }> {
    const userId = (client.data as SosSocketData)?.userId;
    if (!userId) {
      return { ok: false, error: 'Chưa xác thực' };
    }

    const { workspaceId, alertId } = body ?? {};
    if (!workspaceId || !alertId) {
      return { ok: false, error: 'Thiếu workspaceId hoặc alertId' };
    }
    if (!this.isValidCoord(body.latitude, body.longitude)) {
      return { ok: false, error: 'Toạ độ không hợp lệ' };
    }

    const membership = await this.familyMembersService.findByFamilyAndUser(
      workspaceId,
      userId,
    );
    if (!membership) {
      return { ok: false, error: 'Không phải thành viên' };
    }

    try {
      await this.sosService.pushResponderLocation(
        workspaceId,
        alertId,
        membership.id,
        {
          latitude: body.latitude as number,
          longitude: body.longitude as number,
          accuracy: body.accuracy,
          sourceType: body.sourceType ?? GpsSourceType.MOBILE_GPS,
          recordedAt: body.recordedAt,
          deviceId: body.deviceId,
        },
      );
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('sos:leave')
  async handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { workspaceId?: string },
  ): Promise<{ left: boolean; workspaceId?: string }> {
    if (body?.workspaceId) {
      await client.leave(this.room(body.workspaceId));
    }
    return { left: true, workspaceId: body?.workspaceId };
  }

  // ---------------------------------------------------------------------------
  // Emit API — called by SosService after a successful write.
  // ---------------------------------------------------------------------------

  emitNewAlert(workspaceId: string, payload: unknown): void {
    this.server.to(this.room(workspaceId)).emit('sos:new', payload);
  }

  emitLocation(workspaceId: string, payload: unknown): void {
    this.server.to(this.room(workspaceId)).emit('sos:location', payload);
  }

  emitResponse(workspaceId: string, payload: unknown): void {
    this.server.to(this.room(workspaceId)).emit('sos:response', payload);
  }

  emitResponderLocation(workspaceId: string, payload: unknown): void {
    this.server
      .to(this.room(workspaceId))
      .emit('sos:responder:location', payload);
  }

  emitResolved(workspaceId: string, payload: unknown): void {
    this.server.to(this.room(workspaceId)).emit('sos:resolved', payload);
  }

  /**
   * Targeted emit to every live socket of a single user (not a room). Used to
   * signal the trigger's own device, e.g. `sos:track:start` / `sos:track:stop`.
   */
  emitToUser(userId: string, event: string, payload: unknown): void {
    const sockets = this.userSockets.get(userId);
    if (!sockets) {
      return;
    }
    for (const socketId of sockets) {
      this.server.to(socketId).emit(event, payload);
    }
  }

  /**
   * Force every socket of a member out of a workspace room (member removed from
   * the family). Uses the socket.io server-side adapter so it works regardless
   * of which node a socket lives on.
   */
  kickMemberFromWorkspace(userId: string, workspaceId: string): void {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) {
      return;
    }
    const room = this.room(workspaceId);
    for (const socketId of sockets) {
      this.server.in(socketId).socketsLeave(room);
      this.server.to(socketId).emit('sos:kicked', { workspaceId });
    }
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

  private room(workspaceId: string): string {
    return `workspace:${workspaceId}`;
  }

  private isValidCoord(lat?: number, lng?: number): boolean {
    return (
      typeof lat === 'number' &&
      Number.isFinite(lat) &&
      lat >= -90 &&
      lat <= 90 &&
      typeof lng === 'number' &&
      Number.isFinite(lng) &&
      lng >= -180 &&
      lng <= 180
    );
  }
}
