import { Module } from '@nestjs/common';

import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

/** Thiết bị nhận FCM push — đăng ký/hủy device token. */
@Module({
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
