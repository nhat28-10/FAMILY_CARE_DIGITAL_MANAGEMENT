import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BudgetAlertStatus } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { VerifiedGuard } from '../../auth/guards/verified.guard';
import { CurrentFamilyMember } from '../../family-members/decorators/current-family-member.decorator';
import { FamilyRoles } from '../../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../../family-members/guards/family-permission.guard';
import { FINANCE_MANAGER_ROLES } from './finance-controller.constants';
import { BudgetAlertQueryDto } from '../dto/budget-alert-query.dto';
import { RecomputeBudgetAlertsDto } from '../dto/recompute-budget-alerts.dto';
import { ResolveBudgetAlertDto } from '../dto/resolve-budget-alert.dto';
import { BudgetAlertService } from '../services/budget-alert.service';

@ApiTags('Finance - Cảnh báo tài chính')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình cần truy cập tài chính',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/finance')
export class FinanceAlertsController {
  constructor(private readonly budgetAlertService: BudgetAlertService) {}

  @Get('alerts')
  @ResponseMessage('Lấy danh sách cảnh báo tài chính thành công')
  @ApiOperation({ summary: 'Lấy danh sách cảnh báo tài chính có thể xem' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: BudgetAlertStatus,
    description: 'Lọc theo trạng thái cảnh báo',
  })
  @ApiResponse({ status: 200, description: 'Danh sách cảnh báo tài chính' })
  listBudgetAlerts(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() query: BudgetAlertQueryDto,
  ) {
    return this.budgetAlertService.listBudgetAlerts(familyId, memberId, query);
  }

  @Get('alerts/:alertId')
  @ResponseMessage('Lấy cảnh báo tài chính thành công')
  @ApiOperation({ summary: 'Lấy chi tiết cảnh báo tài chính' })
  @ApiParam({
    name: 'alertId',
    description: 'ID cảnh báo tài chính cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy cảnh báo tài chính',
  })
  getBudgetAlert(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('alertId') alertId: string,
  ) {
    return this.budgetAlertService.getBudgetAlert(familyId, memberId, alertId);
  }

  @Post('alerts/recompute')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Tính lại cảnh báo tài chính thành công')
  @ApiOperation({
    summary: 'Tính lại cảnh báo ngân sách và mục tiêu tài chính',
  })
  @ApiResponse({ status: 200, description: 'Cảnh báo đã được đồng bộ' })
  recomputeBudgetGoalAlerts(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: RecomputeBudgetAlertsDto,
  ) {
    return this.budgetAlertService.recomputeBudgetGoalAlerts(
      familyId,
      memberId,
      dto,
    );
  }

  @Patch('alerts/:alertId/acknowledge')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Xác nhận cảnh báo tài chính thành công')
  @ApiOperation({ summary: 'Xác nhận đã xem cảnh báo tài chính' })
  @ApiParam({
    name: 'alertId',
    description: 'ID cảnh báo tài chính cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({ status: 400, description: 'Cảnh báo đã được giải quyết' })
  acknowledgeBudgetAlert(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('alertId') alertId: string,
  ) {
    return this.budgetAlertService.acknowledgeBudgetAlert(
      familyId,
      memberId,
      alertId,
    );
  }

  @Patch('alerts/:alertId/resolve')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Giải quyết cảnh báo tài chính thành công')
  @ApiOperation({ summary: 'Đánh dấu cảnh báo tài chính đã được giải quyết' })
  @ApiParam({
    name: 'alertId',
    description: 'ID cảnh báo tài chính cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({ status: 409, description: 'Cảnh báo đã được giải quyết' })
  resolveBudgetAlert(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('alertId') alertId: string,
    @Body() dto: ResolveBudgetAlertDto,
  ) {
    return this.budgetAlertService.resolveBudgetAlert(
      familyId,
      memberId,
      alertId,
      dto,
    );
  }
}
