import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
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
import { BudgetPlanQueryDto } from '../dto/budget-plan-query.dto';
import { CreateBudgetLineDto } from '../dto/create-budget-line.dto';
import { CreateBudgetPlanDto } from '../dto/create-budget-plan.dto';
import { UpdateBudgetLineDto } from '../dto/update-budget-line.dto';
import { UpdateBudgetPlanDto } from '../dto/update-budget-plan.dto';
import { FinanceReportService } from '../services/finance-report.service';
import { FinanceService } from '../services/finance.service';

@ApiTags('Finance - Kế hoạch ngân sách')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình cần truy cập tài chính',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/finance')
export class FinanceBudgetController {
  constructor(
    private readonly financeService: FinanceService,
    private readonly financeReportService: FinanceReportService,
  ) {}

  @Get('budget-plans')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Lấy danh sách kế hoạch ngân sách thành công')
  @ApiOperation({ summary: 'Lấy danh sách kế hoạch ngân sách của gia đình' })
  @ApiResponse({ status: 200, description: 'Danh sách kế hoạch ngân sách' })
  listBudgetPlans(
    @Param('familyId') familyId: string,
    @Query() query: BudgetPlanQueryDto,
  ) {
    return this.financeService.listBudgetPlans(familyId, query);
  }

  @Post('budget-plans')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo kế hoạch ngân sách thành công')
  @ApiOperation({ summary: 'Tạo kế hoạch ngân sách ở trạng thái DRAFT' })
  @ApiResponse({ status: 201, description: 'Kế hoạch ngân sách đã được tạo' })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu kế hoạch ngân sách không hợp lệ',
  })
  createBudgetPlan(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateBudgetPlanDto,
  ) {
    return this.financeService.createBudgetPlan(familyId, memberId, dto);
  }

  @Get('budget-plans/:budgetPlanId')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Lấy kế hoạch ngân sách thành công')
  @ApiOperation({ summary: 'Lấy chi tiết kế hoạch ngân sách' })
  @ApiParam({
    name: 'budgetPlanId',
    description: 'ID kế hoạch ngân sách cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy kế hoạch ngân sách',
  })
  getBudgetPlan(
    @Param('familyId') familyId: string,
    @Param('budgetPlanId') budgetPlanId: string,
  ) {
    return this.financeService.getBudgetPlan(familyId, budgetPlanId);
  }

  @Patch('budget-plans/:budgetPlanId')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Cập nhật kế hoạch ngân sách thành công')
  @ApiOperation({
    summary: 'Cập nhật kế hoạch ngân sách đang ở trạng thái DRAFT',
  })
  @ApiParam({
    name: 'budgetPlanId',
    description: 'ID kế hoạch ngân sách cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({
    status: 400,
    description: 'Không thể chỉnh sửa kế hoạch ngân sách',
  })
  updateBudgetPlan(
    @Param('familyId') familyId: string,
    @Param('budgetPlanId') budgetPlanId: string,
    @Body() dto: UpdateBudgetPlanDto,
  ) {
    return this.financeService.updateBudgetPlan(familyId, budgetPlanId, dto);
  }

  @Patch('budget-plans/:budgetPlanId/activate')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Kích hoạt kế hoạch ngân sách thành công')
  @ApiOperation({ summary: 'Kích hoạt kế hoạch ngân sách' })
  @ApiParam({
    name: 'budgetPlanId',
    description: 'ID kế hoạch ngân sách cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({
    status: 409,
    description: 'Đã có kế hoạch ACTIVE cho cùng kỳ',
  })
  activateBudgetPlan(
    @Param('familyId') familyId: string,
    @Param('budgetPlanId') budgetPlanId: string,
  ) {
    return this.financeService.activateBudgetPlan(familyId, budgetPlanId);
  }

  @Patch('budget-plans/:budgetPlanId/close')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Đóng kế hoạch ngân sách thành công')
  @ApiOperation({ summary: 'Đóng kế hoạch ngân sách đang hoạt động' })
  @ApiParam({
    name: 'budgetPlanId',
    description: 'ID kế hoạch ngân sách cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({
    status: 400,
    description: 'Kế hoạch ngân sách không ở trạng thái ACTIVE',
  })
  closeBudgetPlan(
    @Param('familyId') familyId: string,
    @Param('budgetPlanId') budgetPlanId: string,
  ) {
    return this.financeService.closeBudgetPlan(familyId, budgetPlanId);
  }

  @Patch('budget-plans/:budgetPlanId/cancel')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Hủy kế hoạch ngân sách thành công')
  @ApiOperation({ summary: 'Hủy kế hoạch ngân sách DRAFT hoặc ACTIVE' })
  @ApiParam({
    name: 'budgetPlanId',
    description: 'ID kế hoạch ngân sách cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({ status: 400, description: 'Không thể hủy kế hoạch ngân sách' })
  cancelBudgetPlan(
    @Param('familyId') familyId: string,
    @Param('budgetPlanId') budgetPlanId: string,
  ) {
    return this.financeService.cancelBudgetPlan(familyId, budgetPlanId);
  }

  @Get('budget-plans/:budgetPlanId/report')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Lấy báo cáo kế hoạch ngân sách thành công')
  @ApiOperation({
    summary: 'Lấy báo cáo planned-vs-actual của kế hoạch ngân sách',
  })
  @ApiParam({
    name: 'budgetPlanId',
    description: 'ID kế hoạch ngân sách cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({ status: 200, description: 'Báo cáo planned-vs-actual' })
  getBudgetPlanReport(
    @Param('familyId') familyId: string,
    @Param('budgetPlanId') budgetPlanId: string,
  ) {
    return this.financeReportService.getBudgetPlanReport(
      familyId,
      budgetPlanId,
    );
  }

  @Post('budget-plans/:budgetPlanId/lines')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo dòng ngân sách thành công')
  @ApiOperation({ summary: 'Thêm dòng vào kế hoạch ngân sách DRAFT' })
  @ApiParam({
    name: 'budgetPlanId',
    description: 'ID kế hoạch ngân sách cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({ status: 201, description: 'Dòng ngân sách đã được tạo' })
  createBudgetLine(
    @Param('familyId') familyId: string,
    @Param('budgetPlanId') budgetPlanId: string,
    @Body() dto: CreateBudgetLineDto,
  ) {
    return this.financeService.createBudgetLine(familyId, budgetPlanId, dto);
  }

  @Patch('budget-lines/:budgetLineId')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Cập nhật dòng ngân sách thành công')
  @ApiOperation({ summary: 'Cập nhật dòng ngân sách thuộc kế hoạch DRAFT' })
  @ApiParam({
    name: 'budgetLineId',
    description: 'ID dòng ngân sách cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy dòng ngân sách' })
  updateBudgetLine(
    @Param('familyId') familyId: string,
    @Param('budgetLineId') budgetLineId: string,
    @Body() dto: UpdateBudgetLineDto,
  ) {
    return this.financeService.updateBudgetLine(familyId, budgetLineId, dto);
  }

  @Delete('budget-lines/:budgetLineId')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Xóa dòng ngân sách thành công')
  @ApiOperation({ summary: 'Xóa dòng ngân sách thuộc kế hoạch DRAFT' })
  @ApiParam({
    name: 'budgetLineId',
    description: 'ID dòng ngân sách cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy dòng ngân sách' })
  deleteBudgetLine(
    @Param('familyId') familyId: string,
    @Param('budgetLineId') budgetLineId: string,
  ) {
    return this.financeService.deleteBudgetLine(familyId, budgetLineId);
  }
}
