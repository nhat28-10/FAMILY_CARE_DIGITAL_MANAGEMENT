import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';

import { AlbumFaceSuggestionsService } from '../album-face-suggestions.service';
import { AlbumModerationService } from './album-moderation.service';
import { CloudflareQueueService } from './cloudflare-queue.service';
import { sanitizeModerationError } from './moderation.types';

type RoutedQueueJob =
  | {
      kind: 'moderation';
      id: string;
      job: NonNullable<ReturnType<AlbumModerationService['parseJob']>>;
    }
  | {
      kind: 'faceScan';
      id: string;
      job: NonNullable<ReturnType<AlbumFaceSuggestionsService['parseJob']>>;
    };

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
    private readonly faceSuggestions: AlbumFaceSuggestionsService,
    config: ConfigService,
  ) {
    this.enabled =
      config.get<boolean>('albumModeration.consumerEnabled', false) ||
      config.get<boolean>('faceScan.consumerEnabled', false);
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
      Math.max(
        config.get<number>('albumModeration.maxAttempts', 3),
        config.get<number>('faceScan.maxAttempts', 3),
      ),
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
        const routed = this.routeMessage(message.body);
        if (!routed) {
          this.logger.warn('Acked invalid album queue message');
          acks.push(message.leaseId);
          continue;
        }
        try {
          const result =
            routed.kind === 'moderation'
              ? await this.moderation.processJob(routed.job)
              : await this.faceSuggestions.processJob(routed.job);
          if (result.action === 'ACK') acks.push(message.leaseId);
          else {
            retries.push({
              leaseId: message.leaseId,
              delaySeconds: result.retryDelaySeconds ?? this.retryDelaySeconds,
            });
          }
        } catch (error) {
          this.logger.error(
            `Album queue job ${routed.id} failed unexpectedly: ${sanitizeModerationError(error)}`,
          );
          if (message.attempts >= this.maxDeliveryAttempts) {
            if (routed.kind === 'moderation') {
              await this.moderation.completePoisonedJob(routed.job, error);
            } else {
              await this.faceSuggestions.completePoisonedJob(routed.job, error);
            }
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
        `Album queue consumer paused batch: ${sanitizeModerationError(error)}`,
      );
    } finally {
      this.polling = false;
    }
  }

  private routeMessage(body: unknown): RoutedQueueJob | null {
    const moderationJob = this.moderation.parseJob(body);
    if (moderationJob) {
      return {
        kind: 'moderation',
        id: moderationJob.jobId,
        job: moderationJob,
      };
    }
    const faceScanJob = this.faceSuggestions.parseJob(body);
    if (faceScanJob) {
      return {
        kind: 'faceScan',
        id: faceScanJob.scanJobId,
        job: faceScanJob,
      };
    }
    return null;
  }
}
