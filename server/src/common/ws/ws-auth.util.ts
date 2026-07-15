import { AccountStatus } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';

import type { JwtPayload } from '../../modules/auth/types/jwt-payload.type';
import type { UsersService } from '../../modules/users/users.service';

export interface WsAuthDeps {
  jwtService: JwtService;
  config: ConfigService;
  usersService: UsersService;
}

/**
 * Xác thực handshake WS giống lớp HTTP: verify access token, user phải ACTIVE.
 * Trả về userId; throw Error(message tiếng Việt) nếu thất bại.
 */
export async function authenticateSocket(
  client: Socket,
  deps: WsAuthDeps,
): Promise<string> {
  const token = extractToken(client);
  if (!token) {
    throw new Error('Thiếu token');
  }
  const payload = await deps.jwtService.verifyAsync<JwtPayload>(token, {
    secret: deps.config.getOrThrow<string>('jwt.accessSecret'),
  });
  const user = await deps.usersService.findById(payload.sub);
  if (!user || user.accountStatus !== AccountStatus.ACTIVE) {
    throw new Error('Tài khoản không hợp lệ');
  }
  return user.id;
}

function extractToken(client: Socket): string | null {
  const fromAuth = (client.handshake.auth as { token?: string } | undefined)
    ?.token;
  const fromHeader = client.handshake.headers.authorization;
  const raw = fromAuth ?? fromHeader;
  if (!raw) {
    return null;
  }
  return raw.startsWith('Bearer ') ? raw.slice('Bearer '.length) : raw;
}
