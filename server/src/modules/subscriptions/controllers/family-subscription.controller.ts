import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FamilyRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { VerifiedGuard } from '../../auth/guards/verified.guard';
import { FamilyRoles } from '../../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../../family-members/guards/family-permission.guard';
import { CreateCheckoutDto } from '../dto/create-checkout.dto';
import { SubscriptionsService } from '../subscriptions.service';

// Chỉ FAMILY_MANAGER được mua/gia hạn gói — họ là người chịu trách nhiệm tài chính
// của workspace (theo yêu cầu hội đồng). Deputy/Member không có quyền này.
const BILLING_MANAGER_ROLES = [FamilyRole.FAMILY_MANAGER] as const;

@ApiTags('Subscriptions')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/subscription')
export class FamilySubscriptionController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  @ApiOperation({ summary: 'Xem gói đăng ký hiện tại của gia đình' })
  @ResponseMessage('Lấy thông tin gói thành công')
  getCurrent(@Param('familyId') familyId: string) {
    return this.subscriptionsService.getForFamily(familyId);
  }

  @Post('checkout')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...BILLING_MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo liên kết thanh toán Stripe để nâng gói' })
  @ResponseMessage('Tạo liên kết thanh toán thành công')
  createCheckout(
    @Param('familyId') familyId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.subscriptionsService.createCheckout(
      familyId,
      dto.planCode,
      userId,
    );
  }
}
