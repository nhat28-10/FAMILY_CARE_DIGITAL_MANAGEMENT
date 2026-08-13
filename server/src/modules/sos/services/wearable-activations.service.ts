import { randomInt } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  WearableActivationStatus,
  WearableDeviceType,
} from '@prisma/client';

import { AuthService } from '../../auth/auth.service';
import { PrismaService } from '../../../prisma/prisma.service';
import type { CreateWearableActivationDto } from '../dto/create-wearable-activation.dto';

const ACTIVATION_TTL_MS = 10 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ACTIVATION_ERROR_CODES = {
  ACTIVATION_NOT_FOUND: 'ACTIVATION_NOT_FOUND',
  ACTIVATION_NOT_PAIRED: 'ACTIVATION_NOT_PAIRED',
  ACTIVATION_ALREADY_CLAIMED: 'ACTIVATION_ALREADY_CLAIMED',
  ACTIVATION_EXPIRED: 'ACTIVATION_EXPIRED',
  ACTIVATION_INVALID_DEVICE: 'ACTIVATION_INVALID_DEVICE',
  ACTIVATION_CREATE_FAILED: 'ACTIVATION_CREATE_FAILED',
} as const;

@Injectable()
export class WearableActivationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async create(dto: CreateWearableActivationDto = {}) {
    await this.expireOldSessions();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = this.generateCode();
      try {
        const session = await this.prisma.wearableActivationSession.create({
          data: {
            code,
            deviceName: dto.deviceName?.trim() || null,
            deviceType: dto.deviceType ?? WearableDeviceType.SMARTWATCH,
            expiresAt: new Date(Date.now() + ACTIVATION_TTL_MS),
          },
        });
        return this.toResponse(session);
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          continue;
        }
        throw error;
      }
    }

    throw this.badRequest(
      ACTIVATION_ERROR_CODES.ACTIVATION_CREATE_FAILED,
      'Không tạo được mã kích hoạt wearable',
    );
  }

  async getStatus(sessionId: string) {
    const session = await this.loadSession(sessionId);
    return this.toResponse(await this.refreshExpiredStatus(session));
  }

  async claim(sessionId: string) {
    await this.expireOldSessions();
    const session = await this.loadSession(sessionId);
    const current = await this.refreshExpiredStatus(session);

    if (current.status === WearableActivationStatus.EXPIRED) {
      throw this.gone(
        ACTIVATION_ERROR_CODES.ACTIVATION_EXPIRED,
        'Mã kích hoạt wearable đã hết hạn',
      );
    }
    if (current.status === WearableActivationStatus.CLAIMED) {
      throw this.conflict(
        ACTIVATION_ERROR_CODES.ACTIVATION_ALREADY_CLAIMED,
        'Mã kích hoạt wearable đã được sử dụng',
      );
    }
    if (current.status !== WearableActivationStatus.PAIRED) {
      throw this.badRequest(
        ACTIVATION_ERROR_CODES.ACTIVATION_NOT_PAIRED,
        'Wearable chưa được ghép nối trên mobile',
      );
    }
    if (!current.ownerUserId || !current.wearableDeviceId) {
      throw this.badRequest(
        ACTIVATION_ERROR_CODES.ACTIVATION_INVALID_DEVICE,
        'Session kích hoạt chưa có thiết bị hợp lệ',
      );
    }

    const { auth, refreshTokenId } =
      await this.authService.issueTokenSessionForUserId(current.ownerUserId);
    const updated = await this.prisma.wearableActivationSession.update({
      where: { id: current.id },
      data: {
        status: WearableActivationStatus.CLAIMED,
        claimedAt: new Date(),
        claimedRefreshTokenId: refreshTokenId,
      },
    });

    return {
      activation: this.toResponse(updated),
      ...auth,
    };
  }

  private async loadSession(sessionId: string) {
    const session = await this.prisma.wearableActivationSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException({
        message: 'Không tìm thấy session kích hoạt wearable',
        code: ACTIVATION_ERROR_CODES.ACTIVATION_NOT_FOUND,
        errorCode: ACTIVATION_ERROR_CODES.ACTIVATION_NOT_FOUND,
      });
    }
    return session;
  }

  private async refreshExpiredStatus<
    T extends { id: string; status: WearableActivationStatus; expiresAt: Date },
  >(session: T) {
    if (
      session.expiresAt.getTime() > Date.now() ||
      session.status === WearableActivationStatus.CLAIMED ||
      session.status === WearableActivationStatus.EXPIRED
    ) {
      return session;
    }

    return this.prisma.wearableActivationSession.update({
      where: { id: session.id },
      data: { status: WearableActivationStatus.EXPIRED },
    });
  }

  private expireOldSessions() {
    return this.prisma.wearableActivationSession.updateMany({
      where: {
        status: {
          in: [
            WearableActivationStatus.PENDING,
            WearableActivationStatus.PAIRED,
          ],
        },
        expiresAt: { lte: new Date() },
      },
      data: { status: WearableActivationStatus.EXPIRED },
    });
  }

  private toResponse(session: {
    id: string;
    code: string;
    status: WearableActivationStatus;
    expiresAt: Date;
    workspaceId?: string | null;
    wearableDeviceId?: string | null;
  }) {
    return {
      sessionId: session.id,
      code: session.code,
      status: session.status,
      expiresAt: session.expiresAt,
      familyId: session.workspaceId ?? null,
      deviceId: session.wearableDeviceId ?? null,
    };
  }

  private generateCode() {
    let suffix = '';
    for (let i = 0; i < 6; i += 1) {
      suffix += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
    }
    return `FCW-${suffix}`;
  }

  private isUniqueViolation(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private badRequest(code: string, message: string) {
    return new BadRequestException({ message, code, errorCode: code });
  }

  private conflict(code: string, message: string) {
    return new ConflictException({ message, code, errorCode: code });
  }

  private gone(code: string, message: string) {
    return new GoneException({ message, code, errorCode: code });
  }
}
