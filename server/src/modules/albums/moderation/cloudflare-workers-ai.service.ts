import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaCheckResult } from '@prisma/client';
import sharp from 'sharp';

import {
  AiModerationResult,
  MODERATION_CATEGORY_CODES,
  ModerationCategory,
  ModerationCategoryCode,
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

const TEXT_CATEGORY_MAP: Array<{
  pattern: RegExp;
  code: ModerationCategoryCode;
}> = [
  { pattern: /sexual|explicit/i, code: 'SEXUAL_EXPLICIT' },
  { pattern: /nudity|nude/i, code: 'NUDITY' },
  { pattern: /violence|graphic/i, code: 'GRAPHIC_VIOLENCE' },
  { pattern: /weapon|gun|knife/i, code: 'WEAPON' },
  { pattern: /drug|substance/i, code: 'DRUGS' },
  { pattern: /self[-\s]?harm|suicide/i, code: 'SELF_HARM' },
  { pattern: /hate|extrem/i, code: 'HATE_EXTREMISM' },
];

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
                  'Classify only content-safety risks in the image. Do not infer identity, age, gender, name, or personal attributes. Return only valid compact JSON, no Markdown.',
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Return exactly this JSON shape: {"decision":"SAFE|NEED_REVIEW|FLAGGED","riskScore":0.0,"categories":[{"code":"SEXUAL_EXPLICIT|NUDITY|GRAPHIC_VIOLENCE|WEAPON|DRUGS|SELF_HARM|HATE_EXTREMISM|OTHER_SENSITIVE","score":0.0}],"reasonCode":"UPPER_SNAKE_CASE","summary":"brief non-graphic summary"}. Scores must be numbers from 0 to 1.',
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${mimeType};base64,${image.toString('base64')}`,
                    },
                  },
                ],
              },
            ],
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
      value = this.parseModelText(value);
    }
    return this.parseResultObject(value);
  }

  private parseModelText(text: string): unknown {
    const trimmed = text.trim();
    const jsonCandidate = this.extractJsonCandidate(trimmed);
    if (jsonCandidate) {
      try {
        return JSON.parse(jsonCandidate);
      } catch {
        // Fall through to best-effort label parsing below.
      }
    }
    const labelResult = this.parseLabelResponse(trimmed);
    if (labelResult) return labelResult;
    throw this.invalidResponse();
  }

  private extractJsonCandidate(text: string) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return fenced[1].trim();
    if (text.startsWith('{') && text.endsWith('}')) return text;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    return start >= 0 && end > start ? text.slice(start, end + 1) : null;
  }

  private parseLabelResponse(text: string): AiModerationResult | null {
    const decisionText =
      this.matchField(text, 'decision') ?? this.matchField(text, 'result');
    const decision = this.parseDecision(decisionText ?? text);
    if (!decision) return null;

    const scoreText = this.matchField(text, 'risk\\s*score|score');
    const riskScore = this.normalizeScore(
      scoreText ? Number(scoreText.match(/\d+(?:\.\d+)?/)?.[0]) : NaN,
      decision,
    );
    const categoriesText = this.matchField(text, 'categories?') ?? '';
    const categories = this.parseTextCategories(categoriesText, riskScore);
    const reasonCode =
      this.matchField(text, 'reason\\s*code') ??
      categories[0]?.code ??
      (decision === MediaCheckResult.SAFE ? 'SAFE' : 'OTHER_SENSITIVE');
    const summary =
      this.matchField(text, 'summary') ??
      text.replace(/\s+/g, ' ').trim().slice(0, 500);

    return {
      decision,
      riskScore,
      categories,
      reasonCode,
      summary,
    };
  }

  private matchField(text: string, label: string) {
    const match = text.match(
      new RegExp(
        `(?:^|\\n)\\s*(?:\\*\\*)?(?:${label})(?:\\*\\*)?\\s*:\\s*([^\\n]+)`,
        'i',
      ),
    );
    return match?.[1]?.replace(/\*\*/g, '').trim();
  }

  private parseDecision(value: string) {
    if (/flagged|unsafe|high\s*risk/i.test(value)) {
      return MediaCheckResult.FLAGGED;
    }
    if (/need[_\s-]?review|review|medium|moderate/i.test(value)) {
      return MediaCheckResult.NEED_REVIEW;
    }
    if (/\bsafe\b|low\s*risk/i.test(value)) {
      return MediaCheckResult.SAFE;
    }
    return null;
  }

  private normalizeScore(value: number, decision: MediaCheckResult) {
    if (Number.isFinite(value)) {
      const normalized = value > 1 && value <= 10 ? value / 10 : value;
      return Math.round(Math.min(1, Math.max(0, normalized)) * 10000) / 10000;
    }
    if (decision === MediaCheckResult.FLAGGED) return 0.9;
    if (decision === MediaCheckResult.NEED_REVIEW) return 0.5;
    return 0;
  }

  private parseTextCategories(text: string, riskScore: number) {
    const categories = TEXT_CATEGORY_MAP.filter((item) =>
      item.pattern.test(text),
    ).map((item) => ({ code: item.code, score: riskScore }));
    if (categories.length > 0) return categories;
    return riskScore > 0
      ? [{ code: 'OTHER_SENSITIVE' as const, score: riskScore }]
      : [];
  }

  private parseResultObject(value: unknown): AiModerationResult {
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
