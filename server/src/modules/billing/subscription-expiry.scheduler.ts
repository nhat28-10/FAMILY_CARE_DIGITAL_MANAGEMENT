import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

@Injectable()
export class SubscriptionExpiryScheduler {
  private readonly logger = new Logger(SubscriptionExpiryScheduler.name);

  constructor(private readonly lifecycle: SubscriptionLifecycleService) {}

  @Cron('0 0 * * *', {
    name: 'subscription-expiry-check',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async checkExpiredSubscriptions(): Promise<void> {
    try {
      const result = await this.lifecycle.checkExpiredSubscriptions();
      if (result.expiredCount > 0) {
        this.logger.log(
          `Đã chuyển ${result.expiredCount} subscription hết hạn sang CANCELED.`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Không thể kiểm tra subscription hết hạn: ${message}`);
    }
  }
}
