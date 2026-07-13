import { createHash } from 'crypto';

interface AlbumThrottleRequest {
  familyMember?: { id?: string };
  user?: { id?: string };
  headers?: { authorization?: string };
  ip?: string;
  socket?: { remoteAddress?: string };
}

export function albumMemberTracker(request: Record<string, unknown>): string {
  const req = request as AlbumThrottleRequest;
  const memberId = req.familyMember?.id;
  if (memberId) return `member:${memberId}`;
  const userId = req.user?.id;
  if (userId) return `user:${userId}`;
  const authorization = req.headers?.authorization;
  if (authorization) {
    return `auth:${createHash('sha256').update(authorization).digest('hex')}`;
  }
  return `ip:${req.ip ?? req.socket?.remoteAddress ?? 'unknown'}`;
}
