import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';

import { AlbumModerationService } from './album-moderation.service';
import { CloudflareQueueService } from './cloudflare-queue.service';
import { sanitizeModerationError } from './moderation.types';

@Injectable()
export class AlbumModerationConsumer {
  private readonly logger = new Logger(AlbumModerationConsumer.name);
  private readonly enabled: boolean;
  private readonly pollIntervalMs: number;
  private readonly retryDelaySeconds: number;
  private readonly maxDeliveryAttempts: number;
  private polling = false;
  private lastPollAt = 0;

  constructor(
    private readonly queue: CloudflareQueueService,
    private readonly moderation: AlbumModerationService,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>(
      'albumModeration.consumerEnabled',
      false,
    );
    this.pollIntervalMs = Math.max(
      1000,
      config.get<number>('albumModeration.pollIntervalMs', 5000),
    );
    this.retryDelaySeconds = Math.max(
      1,
      config.get<number>('albumModeration.retryDelaySeconds', 60),
    );
    this.maxDeliveryAttempts = Math.max(
      1,
      config.get<number>('albumModeration.maxAttempts', 3),
    );
  }

  @Interval('album-moderation-consumer', 1000)
  async poll(): Promise<void> {
    const now = Date.now();
    if (
      !this.enabled ||
      this.polling ||
      now - this.lastPollAt < this.pollIntervalMs
    ) {
      return;
    }
    this.polling = true;
    this.lastPollAt = now;
    try {
      const messages = await this.queue.pullMessages();
      if (messages.length === 0) return;
      const acks: string[] = [];
      const retries: Array<{ leaseId: string; delaySeconds: number }> = [];
      for (const message of messages) {
        const job = this.moderation.parseJob(message.body);
        if (!job) {
          this.logger.warn('Đã ack moderation message không hợp lệ');
          acks.push(message.leaseId);
          continue;
        }
        try {
          const result = await this.moderation.processJob(job);
          if (result.action === 'ACK') acks.push(message.leaseId);
          else {
            retries.push({
              leaseId: message.leaseId,
              delaySeconds: result.retryDelaySeconds ?? this.retryDelaySeconds,
            });
          }
        } catch (error) {
          this.logger.error(
            `Moderation job ${job.jobId} lỗi ngoài dự kiến: ${sanitizeModerationError(error)}`,
          );
          if (message.attempts >= this.maxDeliveryAttempts) {
            await this.moderation.completePoisonedJob(job, error);
            acks.push(message.leaseId);
          } else {
            retries.push({
              leaseId: message.leaseId,
              delaySeconds: this.retryDelaySeconds,
            });
          }
        }
      }
      await this.queue.acknowledgeMessages(acks);
      await this.queue.retryMessages(retries);
    } catch (error) {
      this.logger.warn(
        `Moderation consumer tạm dừng batch: ${sanitizeModerationError(error)}`,
      );
    } finally {
      this.polling = false;
    }
  }
}
