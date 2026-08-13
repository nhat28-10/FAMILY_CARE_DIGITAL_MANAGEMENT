import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';

import { AlbumModerationService } from './album-moderation.service';
import { sanitizeModerationError } from './moderation.types';

@Injectable()
export class AlbumModerationRecoveryService {
  private readonly logger = new Logger(AlbumModerationRecoveryService.name);
  private readonly enabled: boolean;
  private readonly batchSize: number;
  private running = false;

  constructor(
    private readonly moderation: AlbumModerationService,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('albumModeration.recoveryEnabled', true);
    this.batchSize = Math.min(
      100,
      Math.max(1, config.get<number>('albumModeration.recoveryBatchSize', 20)),
    );
  }

  @Interval('album-moderation-recovery', 60_000)
  async recover(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.moderation.recoverStaleJobs(this.batchSize);
    } catch (error) {
      this.logger.warn(
        `Moderation recovery tạm dừng: ${sanitizeModerationError(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
