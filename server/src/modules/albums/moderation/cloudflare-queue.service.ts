import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AlbumModerationJob,
  ModerationProviderError,
  PulledQueueMessage,
} from './moderation.types';

interface CloudflareEnvelope<T> {
  success?: boolean;
  result?: T;
  errors?: Array<{ code?: number; message?: string }>;
}

interface QueuePullResult {
  messages?: Array<{
    id?: string;
    attempts?: number;
    body?: unknown;
    lease_id?: string;
  }>;
}

@Injectable()
export class CloudflareQueueService {
  private readonly accountId: string;
  private readonly queueId: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly batchSize: number;
  private readonly visibilityTimeoutMs: number;

  constructor(config: ConfigService) {
    this.accountId = config.get<string>('cloudflare.accountId', '');
    this.queueId = config.get<string>('cloudflare.queueId', '');
    this.token =
      config.get<string>('cloudflare.queueApiToken', '') ||
      config.get<string>('cloudflare.apiToken', '');
    this.timeoutMs = config.get<number>('cloudflare.aiTimeoutMs', 30000);
    this.batchSize = Math.min(
      100,
      Math.max(1, config.get<number>('albumModeration.batchSize', 2)),
    );
    this.visibilityTimeoutMs = config.get<number>(
      'albumModeration.visibilityTimeoutMs',
      180000,
    );
  }

  async pushModerationJob(job: AlbumModerationJob): Promise<void> {
    await this.request('/messages', {
      body: job,
      content_type: 'json',
    });
  }

  async pullMessages(): Promise<PulledQueueMessage[]> {
    const result = await this.request<QueuePullResult>('/messages/pull', {
      visibility_timeout_ms: this.visibilityTimeoutMs,
      batch_size: this.batchSize,
    });
    return (result.messages ?? [])
      .filter((item) => typeof item.lease_id === 'string')
      .map((item) => ({
        id: item.id,
        attempts: item.attempts ?? 1,
        body: item.body,
        leaseId: item.lease_id!,
      }));
  }

  async acknowledgeMessages(leaseIds: string[]): Promise<void> {
    if (leaseIds.length === 0) return;
    await this.request('/messages/ack', {
      acks: leaseIds.map((lease_id) => ({ lease_id })),
      retries: [],
    });
  }

  async retryMessages(
    items: Array<{ leaseId: string; delaySeconds: number }>,
  ): Promise<void> {
    if (items.length === 0) return;
    await this.request('/messages/ack', {
      acks: [],
      retries: items.map((item) => ({
        lease_id: item.leaseId,
        delay_seconds: item.delaySeconds,
      })),
    });
  }

  private async request<T = unknown>(path: string, body: unknown): Promise<T> {
    if (!this.accountId || !this.queueId || !this.token) {
      throw new ModerationProviderError(
        'Cloudflare Queue chưa được cấu hình',
        'QUEUE_NOT_CONFIGURED',
        false,
      );
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.accountId)}/queues/${encodeURIComponent(this.queueId)}${path}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
      const text = await response.text();
      let envelope: CloudflareEnvelope<T>;
      try {
        envelope = JSON.parse(text) as CloudflareEnvelope<T>;
      } catch {
        throw new ModerationProviderError(
          'Cloudflare Queue trả response không hợp lệ',
          'QUEUE_INVALID_RESPONSE',
          response.status >= 500,
          response.status,
        );
      }
      if (!response.ok || envelope.success !== true) {
        throw new ModerationProviderError(
          `Cloudflare Queue HTTP ${response.status}`,
          `QUEUE_HTTP_${response.status}`,
          response.status === 429 || response.status >= 500,
          response.status,
        );
      }
      return (envelope.result ?? {}) as T;
    } catch (error) {
      if (error instanceof ModerationProviderError) throw error;
      const timedOut =
        error instanceof Error &&
        (error.name === 'AbortError' || controller.signal.aborted);
      throw new ModerationProviderError(
        timedOut
          ? 'Cloudflare Queue timeout'
          : 'Không thể kết nối Cloudflare Queue',
        timedOut ? 'QUEUE_TIMEOUT' : 'QUEUE_NETWORK',
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
