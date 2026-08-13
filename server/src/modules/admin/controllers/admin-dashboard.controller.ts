import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserType } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AdminService } from '../admin.service';
import { AdminDashboardSummaryResponseDto } from '../dto/admin-response.dto';

@ApiTags('Admin - Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.SYSTEM_ADMIN)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly admin: AdminService) {}

  @Get('summary')
  @ResponseMessage('Lấy tổng quan dashboard thành công')
  @ApiOperation({ summary: 'Get admin dashboard summary (SYSTEM_ADMIN only)' })
  @ApiOkResponse({ type: AdminDashboardSummaryResponseDto })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  summary() {
    return this.admin.getDashboardSummary();
  }
}
