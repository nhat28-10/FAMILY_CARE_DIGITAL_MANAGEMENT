import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import type { RegisterDeviceTokenDto } from './dto/register-device-token.dto';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Upsert theo token: cùng máy đổi tài khoản → token chuyển chủ. */
  register(userId: string, dto: RegisterDeviceTokenDto) {
    return this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      update: {
        userId,
        platform: dto.platform,
        deviceName: dto.deviceName ?? null,
      },
      create: {
        userId,
        token: dto.token,
        platform: dto.platform,
        deviceName: dto.deviceName ?? null,
      },
    });
  }

  async remove(userId: string, token: string): Promise<null> {
    await this.prisma.deviceToken.deleteMany({
      where: { token, userId },
    });
    return null;
  }
}
