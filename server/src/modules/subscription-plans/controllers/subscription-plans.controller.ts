import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SubscriptionPlansService } from '../subscription-plans.service';

@ApiTags('Subscription Plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('subscription-plans')
export class SubscriptionPlansController {
  constructor(private readonly plans: SubscriptionPlansService) {}

  @Get()
  @ResponseMessage('Lấy danh sách gói đăng ký thành công')
  @ApiOperation({ summary: 'List active subscription plans (for subscribers)' })
  listActive() {
    return this.plans.listActive();
  }
}
