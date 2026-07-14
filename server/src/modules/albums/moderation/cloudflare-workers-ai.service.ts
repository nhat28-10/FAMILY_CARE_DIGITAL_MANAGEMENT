import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaCheckResult } from '@prisma/client';
import sharp from 'sharp';

import {
  AiModerationResult,
  MODERATION_CATEGORY_CODES,
  ModerationCategory,
  ModerationProviderError,
} from './moderation.types';

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1536;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    decision: {
      type: 'string',
      enum: ['SAFE', 'NEED_REVIEW', 'FLAGGED'],
    },
    riskScore: { type: 'number', minimum: 0, maximum: 1 },
    categories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string', enum: MODERATION_CATEGORY_CODES },
          score: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['code', 'score'],
      },
    },
    reasonCode: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['decision', 'riskScore', 'categories', 'reasonCode', 'summary'],
} as const;

@Injectable()
export class CloudflareWorkersAiService {
  readonly modelName: string;
  private readonly accountId: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly requestAttempts: number;

  constructor(config: ConfigService) {
    this.accountId = config.get<string>('cloudflare.accountId', '');
    this.token = config.get<string>('cloudflare.apiToken', '');
    this.modelName = config.get<string>(
      'cloudflare.aiModel',
      '@cf/meta/llama-3.2-11b-vision-instruct',
    );
    this.timeoutMs = config.get<number>('cloudflare.aiTimeoutMs', 30000);
    this.requestAttempts = Math.min(
      3,
      Math.max(1, config.get<number>('albumModeration.maxAttempts', 3)),
    );
  }

  async moderateImage(
    image: Buffer,
    mimeType: string,
  ): Promise<AiModerationResult> {
    const prepared = await this.prepareImage(image, mimeType);
    let lastError: ModerationProviderError | undefined;
    for (let attempt = 1; attempt <= this.requestAttempts; attempt += 1) {
      try {
        return await this.execute(prepared.buffer, prepared.mimeType);
      } catch (error) {
        if (!(error instanceof ModerationProviderError)) throw error;
        lastError = error;
        if (!error.transient || attempt === this.requestAttempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 250));
      }
    }
    throw (
      lastError ??
      new ModerationProviderError(
        'Workers AI không trả kết quả',
        'AI_NO_RESULT',
        false,
      )
    );
  }

  private async prepareImage(image: Buffer, mimeType: string) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      throw new ModerationProviderError(
        'MIME ảnh không được hỗ trợ để kiểm duyệt',
        'AI_UNSUPPORTED_IMAGE',
        false,
      );
    }
    try {
      const metadata = await sharp(image).metadata();
      const needsResize =
        image.length > MAX_IMAGE_BYTES ||
        (metadata.width ?? 0) > MAX_IMAGE_DIMENSION ||
        (metadata.height ?? 0) > MAX_IMAGE_DIMENSION;
      if (!needsResize) return { buffer: image, mimeType };

      const buffer = await sharp(image)
        .rotate()
        .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
      return { buffer, mimeType: 'image/jpeg' };
    } catch {
      throw new ModerationProviderError(
        'Không thể đọc hoặc resize ảnh kiểm duyệt',
        'AI_IMAGE_PROCESSING_FAILED',
        false,
      );
    }
  }

  private async execute(
    image: Buffer,
    mimeType: string,
  ): Promise<AiModerationResult> {
    if (!this.accountId || !this.token) {
      throw new ModerationProviderError(
        'Cloudflare Workers AI chưa được cấu hình',
        'AI_NOT_CONFIGURED',
        false,
      );
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.accountId)}/ai/run/${this.modelName}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content:
                  'Classify only content-safety risks in the image. Do not infer identity, age, gender, name, or personal attributes. Scores are heuristic severity signals.',
              },
              {
                role: 'user',
                content:
                  'Return the requested structured moderation result. Keep summary brief and non-graphic.',
              },
            ],
            image: `data:${mimeType};base64,${image.toString('base64')}`,
            response_format: {
              type: 'json_schema',
              json_schema: RESPONSE_SCHEMA,
            },
            temperature: 0,
            max_tokens: 512,
          }),
          signal: controller.signal,
        },
      );
      const text = await response.text();
      if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
        throw new ModerationProviderError(
          'Workers AI response vượt giới hạn',
          'AI_RESPONSE_TOO_LARGE',
          false,
          response.status,
        );
      }
      if (!response.ok) {
        throw new ModerationProviderError(
          `Workers AI HTTP ${response.status}`,
          `AI_HTTP_${response.status}`,
          response.status === 429 || response.status >= 500,
          response.status,
        );
      }
      let envelope: unknown;
      try {
        envelope = JSON.parse(text);
      } catch {
        throw new ModerationProviderError(
          'Workers AI trả JSON không hợp lệ',
          'AI_INVALID_JSON',
          false,
        );
      }
      return this.parseEnvelope(envelope);
    } catch (error) {
      if (error instanceof ModerationProviderError) throw error;
      const timedOut =
        error instanceof Error &&
        (error.name === 'AbortError' || controller.signal.aborted);
      throw new ModerationProviderError(
        timedOut ? 'Workers AI timeout' : 'Không thể kết nối Workers AI',
        timedOut ? 'AI_TIMEOUT' : 'AI_NETWORK',
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseEnvelope(envelope: unknown): AiModerationResult {
    if (!this.isRecord(envelope) || envelope.success !== true) {
      throw this.invalidResponse();
    }
    const result = envelope.result;
    if (!this.isRecord(result) || !('response' in result)) {
      throw this.invalidResponse();
    }
    let value: unknown = result.response;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        throw this.invalidResponse();
      }
    }
    if (!this.isRecord(value)) throw this.invalidResponse();
    const decisions = [
      MediaCheckResult.SAFE,
      MediaCheckResult.NEED_REVIEW,
      MediaCheckResult.FLAGGED,
    ];
    if (
      !decisions.includes(value.decision as MediaCheckResult) ||
      !this.isScore(value.riskScore) ||
      !Array.isArray(value.categories) ||
      typeof value.reasonCode !== 'string' ||
      typeof value.summary !== 'string'
    ) {
      throw this.invalidResponse();
    }
    const categories: ModerationCategory[] = value.categories.map((item) => {
      if (
        !this.isRecord(item) ||
        !MODERATION_CATEGORY_CODES.includes(
          item.code as (typeof MODERATION_CATEGORY_CODES)[number],
        ) ||
        !this.isScore(item.score)
      ) {
        throw this.invalidResponse();
      }
      return {
        code: item.code as ModerationCategory['code'],
        score: item.score,
      };
    });
    if (categories.length > 20) throw this.invalidResponse();

    return {
      decision: value.decision as MediaCheckResult,
      riskScore: value.riskScore,
      categories,
      reasonCode: value.reasonCode.replace(/[^A-Z0-9_:-]/gi, '').slice(0, 100),
      summary: value.summary
        .replace(/[\r\n]+/g, ' ')
        .trim()
        .slice(0, 500),
    };
  }

  private invalidResponse() {
    return new ModerationProviderError(
      'Workers AI response thiếu hoặc sai cấu trúc',
      'AI_INVALID_RESPONSE',
      false,
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isScore(value: unknown): value is number {
    return typeof value === 'number' && value >= 0 && value <= 1;
  }
}
