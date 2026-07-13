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
import { RequiredFinancePeriodDto } from '../dto/finance-period.dto';
import { ConfirmGoalContributionPlanDto } from '../dto/confirm-goal-contribution-plan.dto';
import { CreateFinancialGoalDto } from '../dto/create-financial-goal.dto';
import { CreateGoalAllocationDto } from '../dto/create-goal-allocation.dto';
import { FinancialGoalQueryDto } from '../dto/financial-goal-query.dto';
import { ReviewGoalContributionPlanDto } from '../dto/review-goal-contribution-plan.dto';
import { SubmitGoalContributionPlanDto } from '../dto/submit-goal-contribution-plan.dto';
import { UpdateFinancialGoalDto } from '../dto/update-financial-goal.dto';
import { UpdateGoalAllocationDto } from '../dto/update-goal-allocation.dto';
import { FinanceService } from '../services/finance.service';

@ApiTags('Finance - Mục tiêu tài chính')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình cần truy cập tài chính',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/finance')
export class FinanceGoalsController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('financial-goals')
  @ResponseMessage('Lấy danh sách mục tiêu tài chính thành công')
  @ApiOperation({ summary: 'Lấy danh sách mục tiêu tài chính có thể xem' })
  @ApiResponse({ status: 200, description: 'Danh sách mục tiêu tài chính' })
  listFinancialGoals(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() query: FinancialGoalQueryDto,
  ) {
    return this.financeService.listFinancialGoals(familyId, memberId, query);
  }

  @Post('financial-goals')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo mục tiêu tài chính thành công')
  @ApiOperation({ summary: 'Tạo mục tiêu tài chính gia đình' })
  @ApiResponse({ status: 201, description: 'Mục tiêu tài chính đã được tạo' })
  createFinancialGoal(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateFinancialGoalDto,
  ) {
    return this.financeService.createFinancialGoal(familyId, memberId, dto);
  }

  @Get('financial-goals/:goalId')
  @ResponseMessage('Lấy mục tiêu tài chính thành công')
  @ApiOperation({ summary: 'Lấy chi tiết và tiến độ mục tiêu tài chính' })
  @ApiParam({
    name: 'goalId',
    description: 'ID mục tiêu tài chính cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy mục tiêu tài chính',
  })
  getFinancialGoal(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('goalId') goalId: string,
  ) {
    return this.financeService.getFinancialGoal(familyId, memberId, goalId);
  }

  @Patch('financial-goals/:goalId')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Cập nhật mục tiêu tài chính thành công')
  @ApiOperation({ summary: 'Cập nhật mục tiêu tài chính gia đình' })
  @ApiParam({
    name: 'goalId',
    description: 'ID mục tiêu tài chính cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({ status: 409, description: 'Mục tiêu đã bị hủy' })
  updateFinancialGoal(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('goalId') goalId: string,
    @Body() dto: UpdateFinancialGoalDto,
  ) {
    return this.financeService.updateFinancialGoal(
      familyId,
      memberId,
      goalId,
      dto,
    );
  }

  @Patch('financial-goals/:goalId/cancel')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Hủy mục tiêu tài chính thành công')
  @ApiOperation({ summary: 'Hủy mục tiêu tài chính gia đình' })
  @ApiParam({
    name: 'goalId',
    description: 'ID mục tiêu tài chính cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({ status: 409, description: 'Mục tiêu đã bị hủy' })
  cancelFinancialGoal(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('goalId') goalId: string,
  ) {
    return this.financeService.cancelFinancialGoal(familyId, memberId, goalId);
  }

  @Get('financial-goals/:goalId/progress')
  @ResponseMessage('Lấy tiến độ mục tiêu tài chính thành công')
  @ApiOperation({
    summary: 'Lấy tiến độ tính toán của mục tiêu tài chính',
    description:
      'Endpoint cũ trả cùng dữ liệu với GET financial-goals/:goalId. Client mới nên dùng GET financial-goals/:goalId.',
    deprecated: true,
  })
  @ApiParam({
    name: 'goalId',
    description: 'ID mục tiêu tài chính cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({ status: 200, description: 'Tiến độ mục tiêu tài chính' })
  getFinancialGoalProgress(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('goalId') goalId: string,
  ) {
    return this.financeService.getFinancialGoalProgress(
      familyId,
      memberId,
      goalId,
    );
  }

  @Get('financial-goals/:goalId/contribution-suggestions')
  @ResponseMessage('Lấy gợi ý đóng góp mục tiêu thành công')
  @ApiOperation({
    summary:
      'Tính gợi ý đóng góp hằng tháng của mỗi thành viên cho mục tiêu tài chính',
  })
  @ApiParam({
    name: 'goalId',
    description: 'ID mục tiêu tài chính cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Gợi ý đóng góp theo từng thành viên',
  })
  getGoalContributionSuggestions(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('goalId') goalId: string,
    @Query() period: RequiredFinancePeriodDto,
  ) {
    return this.financeService.getGoalContributionSuggestions(
      familyId,
      memberId,
      goalId,
      period,
    );
  }

  @Post('financial-goals/:goalId/contribution-plans/confirm')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage(
    'Xác nhận hoặc cập nhật kế hoạch đóng góp mục tiêu theo tháng thành công',
  )
  @ApiOperation({
    summary: 'Xác nhận hoặc cập nhật kế hoạch đóng góp mục tiêu theo tháng',
  })
  @ApiParam({
    name: 'goalId',
    description: 'ID mục tiêu tài chính cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({ status: 200, description: 'Kế hoạch đóng góp đã được lưu' })
  confirmGoalContributionPlans(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('goalId') goalId: string,
    @Body() dto: ConfirmGoalContributionPlanDto,
  ) {
    return this.financeService.confirmGoalContributionPlans(
      familyId,
      memberId,
      goalId,
      dto,
    );
  }

  @Post('financial-goals/:goalId/contribution-plans/:planId/submit')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Xác nhận khoản đóng góp thành công')
  @ApiOperation({
    summary: 'Thành viên xác nhận đã đóng góp vào kế hoạch mục tiêu',
  })
  @ApiParam({
    name: 'goalId',
    description: 'ID mục tiêu tài chính cần thao tác',
    format: 'uuid',
  })
  @ApiParam({
    name: 'planId',
    description: 'ID kế hoạch đóng góp mục tiêu cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({ status: 200, description: 'Khoản đóng góp đang chờ xác nhận' })
  submitGoalContributionPlan(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('goalId') goalId: string,
    @Param('planId') planId: string,
    @Body() dto: SubmitGoalContributionPlanDto,
  ) {
    return this.financeService.submitGoalContributionPlan(
      familyId,
      memberId,
      goalId,
      planId,
      dto,
    );
  }

  @Post('financial-goals/:goalId/contribution-plans/:planId/approve')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Phê duyệt khoản đóng góp mục tiêu thành công')
  @ApiOperation({
    summary:
      'Manager/deputy phê duyệt khoản đóng góp và ghi vào sổ sách tài chính',
  })
  @ApiParam({
    name: 'goalId',
    description: 'ID mục tiêu tài chính cần thao tác',
    format: 'uuid',
  })
  @ApiParam({
    name: 'planId',
    description: 'ID kế hoạch đóng góp mục tiêu cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({ status: 200, description: 'Khoản đóng góp đã được phê duyệt' })
  approveGoalContributionPlan(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('goalId') goalId: string,
    @Param('planId') planId: string,
    @Body() dto: ReviewGoalContributionPlanDto,
  ) {
    return this.financeService.approveGoalContributionPlan(
      familyId,
      memberId,
      goalId,
      planId,
      dto,
    );
  }

  @Post('financial-goals/:goalId/contribution-plans/:planId/reject')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Từ chối khoản đóng góp mục tiêu thành công')
  @ApiOperation({
    summary: 'Manager/deputy từ chối khoản đóng góp đang chờ xác nhận',
  })
  @ApiParam({
    name: 'goalId',
    description: 'ID mục tiêu tài chính cần thao tác',
    format: 'uuid',
  })
  @ApiParam({
    name: 'planId',
    description: 'ID kế hoạch đóng góp mục tiêu cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({ status: 200, description: 'Khoản đóng góp đã bị từ chối' })
  rejectGoalContributionPlan(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('goalId') goalId: string,
    @Param('planId') planId: string,
    @Body() dto: ReviewGoalContributionPlanDto,
  ) {
    return this.financeService.rejectGoalContributionPlan(
      familyId,
      memberId,
      goalId,
      planId,
      dto,
    );
  }

  @Get('financial-goals/:goalId/contribution-plans')
  @ResponseMessage('Lấy kế hoạch và thực tế đóng góp mục tiêu thành công')
  @ApiOperation({
    summary: 'Lấy kế hoạch và thực tế đóng góp mục tiêu',
    description:
      'Trả chi tiết planned vs actual theo từng thành viên trong kỳ.',
  })
  @ApiParam({
    name: 'goalId',
    description: 'ID mục tiêu tài chính cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Chi tiết kế hoạch và thực tế đóng góp theo từng thành viên',
  })
  listGoalContributionPlans(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('goalId') goalId: string,
    @Query() period: RequiredFinancePeriodDto,
  ) {
    return this.financeService.listGoalContributionPlans(
      familyId,
      memberId,
      goalId,
      period,
    );
  }

  @Get('financial-goals/:goalId/contribution-shortage')
  @ResponseMessage('Lấy tổng thiếu hụt đóng góp mục tiêu theo tháng thành công')
  @ApiOperation({
    summary: 'Lấy phần đóng góp mục tiêu còn thiếu theo tháng',
    description:
      'Trả dữ liệu rút gọn về phần đóng góp còn thiếu, không thay thế contribution-plans.',
  })
  @ApiParam({
    name: 'goalId',
    description: 'ID mục tiêu tài chính cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Dữ liệu rút gọn về phần đóng góp còn thiếu',
  })
  getGoalContributionShortage(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('goalId') goalId: string,
    @Query() period: RequiredFinancePeriodDto,
  ) {
    return this.financeService.getGoalContributionShortage(
      familyId,
      memberId,
      goalId,
      period,
    );
  }

  @Get('financial-goals/:goalId/allocations')
  @ResponseMessage('Lấy danh sách phân bổ mục tiêu thành công')
  @ApiOperation({ summary: 'Lấy các giao dịch đã phân bổ vào mục tiêu' })
  @ApiParam({
    name: 'goalId',
    description: 'ID mục tiêu tài chính cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({ status: 200, description: 'Danh sách phân bổ mục tiêu' })
  listGoalAllocations(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('goalId') goalId: string,
  ) {
    return this.financeService.listGoalAllocations(familyId, memberId, goalId);
  }

  @Post('financial-goals/:goalId/allocations')
  @UseGuards(VerifiedGuard)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Phân bổ giao dịch vào mục tiêu thành công')
  @ApiOperation({
    summary: 'Phân bổ một phần giao dịch vào mục tiêu tài chính',
  })
  @ApiParam({
    name: 'goalId',
    description: 'ID mục tiêu tài chính cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({ status: 201, description: 'Phân bổ mục tiêu đã được tạo' })
  createGoalAllocation(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('goalId') goalId: string,
    @Body() dto: CreateGoalAllocationDto,
  ) {
    return this.financeService.createGoalAllocation(
      familyId,
      memberId,
      goalId,
      dto,
    );
  }

  @Patch('goal-allocations/:allocationId')
  @UseGuards(VerifiedGuard)
  @ResponseMessage('Cập nhật phân bổ mục tiêu thành công')
  @ApiOperation({ summary: 'Cập nhật số tiền phân bổ vào mục tiêu' })
  @ApiParam({
    name: 'allocationId',
    description: 'ID phân bổ mục tiêu cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy phân bổ mục tiêu' })
  updateGoalAllocation(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('allocationId') allocationId: string,
    @Body() dto: UpdateGoalAllocationDto,
  ) {
    return this.financeService.updateGoalAllocation(
      familyId,
      memberId,
      allocationId,
      dto,
    );
  }

  @Delete('goal-allocations/:allocationId')
  @UseGuards(VerifiedGuard)
  @ResponseMessage('Xóa phân bổ mục tiêu thành công')
  @ApiOperation({ summary: 'Xóa phân bổ khỏi mục tiêu tài chính' })
  @ApiParam({
    name: 'allocationId',
    description: 'ID phân bổ mục tiêu cần thao tác',
    format: 'uuid',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy phân bổ mục tiêu' })
  deleteGoalAllocation(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('allocationId') allocationId: string,
  ) {
    return this.financeService.deleteGoalAllocation(
      familyId,
      memberId,
      allocationId,
    );
  }
}
