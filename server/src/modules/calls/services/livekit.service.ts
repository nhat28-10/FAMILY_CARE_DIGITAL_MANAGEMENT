import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  RoomServiceClient,
  WebhookReceiver,
} from 'livekit-server-sdk';
import type { WebhookEvent } from 'livekit-server-sdk';

import { CALL_ERROR_CODES } from '../calls.types';

/**
 * Bọc LiveKit Server SDK: sinh access token cho client join room, verify
 * webhook, và đóng room khi call kết thúc (ngắt kết nối mọi participant còn
 * lại — LiveKit không tự đóng room ngay khi ta đổi trạng thái ở DB).
 */
@Injectable()
export class LiveKitService {
  private readonly logger = new Logger(LiveKitService.name);
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly wsUrl: string;
  private readonly roomService: RoomServiceClient;
  private readonly webhookReceiver: WebhookReceiver;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('livekit.apiKey') || '';
    this.apiSecret = config.get<string>('livekit.apiSecret') || '';
    this.wsUrl = config.get<string>('livekit.url') || '';
    this.roomService = new RoomServiceClient(
      this.toHttpUrl(this.wsUrl),
      this.apiKey,
      this.apiSecret,
    );
    this.webhookReceiver = new WebhookReceiver(this.apiKey, this.apiSecret);
  }

  get url(): string {
    return this.wsUrl;
  }

  async createToken(
    roomName: string,
    identity: string,
    displayName?: string,
  ): Promise<string> {
    this.assertConfigured();
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity,
      name: displayName,
      ttl: '10m',
    });
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });
    return token.toJwt();
  }

  /** Đóng room LiveKit — ngắt kết nối mọi client còn lại. Best-effort. */
  async closeRoom(roomName: string): Promise<void> {
    if (!this.apiKey || !this.apiSecret || !this.wsUrl) {
      return;
    }
    try {
      await this.roomService.deleteRoom(roomName);
    } catch (err) {
      this.logger.warn(
        `Không thể đóng phòng LiveKit ${roomName}: ${(err as Error).message}`,
      );
    }
  }

  async verifyWebhook(body: string, authHeader: string): Promise<WebhookEvent> {
    return this.webhookReceiver.receive(body, authHeader);
  }

  private assertConfigured(): void {
    if (!this.apiKey || !this.apiSecret || !this.wsUrl) {
      throw new ServiceUnavailableException({
        message: 'Tính năng gọi video chưa được cấu hình',
        code: CALL_ERROR_CODES.LIVEKIT_NOT_CONFIGURED,
        errorCode: CALL_ERROR_CODES.LIVEKIT_NOT_CONFIGURED,
      });
    }
  }

  private toHttpUrl(wsUrl: string): string {
    return wsUrl
      .replace(/^wss:\/\//, 'https://')
      .replace(/^ws:\/\//, 'http://');
  }
}
