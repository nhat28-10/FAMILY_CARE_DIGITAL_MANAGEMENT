import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DevicesService } from './devices.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';

@ApiTags('Devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post('tokens')
  @ResponseMessage('Đăng ký thiết bị nhận thông báo thành công')
  @ApiOperation({ summary: 'Đăng ký FCM token của thiết bị hiện tại' })
  register(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    return this.devicesService.register(userId, dto);
  }

  @Delete('tokens/:token')
  @ResponseMessage('Hủy đăng ký thiết bị thành công')
  @ApiOperation({ summary: 'Hủy FCM token (gọi khi logout)' })
  remove(@CurrentUser('id') userId: string, @Param('token') token: string) {
    return this.devicesService.remove(userId, token);
  }
}
