import { Global, Module } from '@nestjs/common';

import { MailService } from './mail.service';

/**
 * Hạ tầng email dùng chung. Đánh dấu @Global() để mọi module (auth,
 * notifications, invitations...) inject MailService mà không cần import lại.
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
