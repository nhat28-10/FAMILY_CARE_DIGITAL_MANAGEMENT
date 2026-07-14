import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserType } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AdminService } from '../admin.service';
import {
  ADMIN_PAYMENT_STATUSES,
  AdminPaymentQueryDto,
} from '../dto/admin-payment-query.dto';
import { AdminPaymentsListResponseDto } from '../dto/admin-response.dto';

@ApiTags('Admin - Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.SYSTEM_ADMIN)
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  @ResponseMessage('Lấy danh sách thanh toán thành công')
  @ApiOperation({ summary: 'List subscription payments for admin' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: ADMIN_PAYMENT_STATUSES })
  @ApiQuery({
    name: 'planCode',
    required: false,
    type: String,
    example: 'MONTHLY',
  })
  @ApiQuery({
    name: 'familyId',
    required: false,
    type: String,
    description: 'Filter payments by family id',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    example: '2026-01-01',
    description: 'Filter payments created at or after this date/time',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    example: '2026-12-31',
    description:
      'Filter payments created at or before this date/time. YYYY-MM-DD is inclusive for the whole day.',
  })
  @ApiOkResponse({ type: AdminPaymentsListResponseDto })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  list(@Query() query: AdminPaymentQueryDto) {
    return this.admin.listPayments(query);
  }
}
