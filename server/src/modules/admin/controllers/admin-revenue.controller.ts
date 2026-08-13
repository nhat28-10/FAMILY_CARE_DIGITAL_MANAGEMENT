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
import { AdminRevenueSummaryResponseDto } from '../dto/admin-response.dto';
import {
  AdminMonthlyRevenueItemDto,
  AdminRevenueMonthlyQueryDto,
} from '../dto/admin-revenue-monthly-query.dto';

@ApiTags('Admin - Revenue')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.SYSTEM_ADMIN)
@Controller('admin/revenue')
export class AdminRevenueController {
  constructor(private readonly admin: AdminService) {}

  @Get('summary')
  @ResponseMessage('Lấy tổng quan doanh thu thành công')
  @ApiOperation({ summary: 'Get subscription revenue summary' })
  @ApiOkResponse({ type: AdminRevenueSummaryResponseDto })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  summary() {
    return this.admin.getRevenueSummary();
  }

  @Get('monthly')
  @ResponseMessage('Lấy doanh thu theo tháng thành công')
  @ApiOperation({ summary: 'Get monthly subscription revenue' })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    example: '2026-01-01',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    example: '2026-12-31',
  })
  @ApiQuery({
    name: 'planCode',
    required: false,
    type: String,
    example: 'YEARLY',
  })
  @ApiOkResponse({
    description:
      'Monthly paid subscription revenue. Revenue fields are amount sums from payment_transactions.amount; paidCount is the transaction count.',
    type: AdminMonthlyRevenueItemDto,
    isArray: true,
  })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  monthly(@Query() query: AdminRevenueMonthlyQueryDto) {
    return this.admin.getMonthlyRevenue(query);
  }
}
