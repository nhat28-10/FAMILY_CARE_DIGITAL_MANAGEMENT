import { AlbumMediaType, MediaCheckResult } from '@prisma/client';

export const MODERATION_JOB_TYPE = 'ALBUM_MEDIA_MODERATION' as const;
export const MODERATION_JOB_VERSION = 1 as const;

export interface AlbumModerationJob {
  version: typeof MODERATION_JOB_VERSION;
  type: typeof MODERATION_JOB_TYPE;
  jobId: string;
  mediaId: string;
  workspaceId: string;
  storageKey: string;
  mediaType: AlbumMediaType;
  requestedAt: string;
}

export interface PulledQueueMessage {
  id?: string;
  attempts: number;
  body: unknown;
  leaseId: string;
}

export interface ModerationCategory {
  code: ModerationCategoryCode;
  score: number;
}

export const MODERATION_CATEGORY_CODES = [
  'SEXUAL_EXPLICIT',
  'NUDITY',
  'GRAPHIC_VIOLENCE',
  'WEAPON',
  'DRUGS',
  'SELF_HARM',
  'HATE_EXTREMISM',
  'OTHER_SENSITIVE',
] as const;

export type ModerationCategoryCode = (typeof MODERATION_CATEGORY_CODES)[number];

export interface AiModerationResult {
  decision: MediaCheckResult;
  riskScore: number;
  categories: ModerationCategory[];
  reasonCode: string;
  summary: string;
}

export interface ModerationProcessResult {
  action: 'ACK' | 'RETRY';
  retryDelaySeconds?: number;
}

export class ModerationProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly transient: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ModerationProviderError';
  }
}

export function sanitizeModerationError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Lỗi không xác định';
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(
      /([?&](?:X-Amz-[^=]+|token|signature|credential)=)[^&\s]+/gi,
      '$1[REDACTED]',
    )
    .replace(/(?:api[_-]?key|secret|token)\s*[:=]\s*\S+/gi, '[REDACTED]')
    .slice(0, 1000);
}
