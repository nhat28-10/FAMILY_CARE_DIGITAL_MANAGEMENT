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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FamilyRole } from '@prisma/client';
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
import { CurrentFamilyMember } from '../../family-members/decorators/current-family-member.decorator';
import { FamilyRoles } from '../../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../../family-members/guards/family-permission.guard';
import { CreateFinanceCategoryDto } from '../dto/create-finance-category.dto';
import { BudgetAlertQueryDto } from '../dto/budget-alert-query.dto';
import { CreateFinancialGoalDto } from '../dto/create-financial-goal.dto';
import { CreateGoalAllocationDto } from '../dto/create-goal-allocation.dto';
import { BudgetPlanQueryDto } from '../dto/budget-plan-query.dto';
import { ConfirmGoalContributionPlanDto } from '../dto/confirm-goal-contribution-plan.dto';
import { CreateBudgetLineDto } from '../dto/create-budget-line.dto';
import { CreateBudgetPlanDto } from '../dto/create-budget-plan.dto';
import { CreateFinanceJarDto } from '../dto/create-finance-jar.dto';
import { CreateFinanceModelDto } from '../dto/create-finance-model.dto';
import { CreateLedgerEntryDto } from '../dto/create-ledger-entry.dto';
import { CreateMemberMonthlyFinanceDto } from '../dto/create-member-monthly-finance.dto';
import { CreateSpendingSupportRequestDto } from '../dto/create-spending-support-request.dto';
import {
  OptionalFinancePeriodDto,
  RequiredFinancePeriodDto,
} from '../dto/finance-period.dto';
import { FinancialGoalQueryDto } from '../dto/financial-goal-query.dto';
import { FinanceReportQueryDto } from '../dto/finance-report-query.dto';
import { RecomputeBudgetAlertsDto } from '../dto/recompute-budget-alerts.dto';
import { ResolveBudgetAlertDto } from '../dto/resolve-budget-alert.dto';
import { ReviewGoalContributionPlanDto } from '../dto/review-goal-contribution-plan.dto';
import { ReviewSpendingSupportRequestDto } from '../dto/review-spending-support-request.dto';
import { SpendingSupportRequestQueryDto } from '../dto/spending-support-request-query.dto';
import { SubmitGoalContributionPlanDto } from '../dto/submit-goal-contribution-plan.dto';
import { UpdateFinancialGoalDto } from '../dto/update-financial-goal.dto';
import { UpdateGoalAllocationDto } from '../dto/update-goal-allocation.dto';
import { UpdateMemberMonthlyFinanceDto } from '../dto/update-member-monthly-finance.dto';
import { UpdateFinanceJarDto } from '../dto/update-finance-jar.dto';
import { UpdateBudgetLineDto } from '../dto/update-budget-line.dto';
import { UpdateBudgetPlanDto } from '../dto/update-budget-plan.dto';
import { FinanceService } from '../services/finance.service';

const FINANCE_MANAGER_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
] as const;

@ApiTags('Finance')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình cần truy cập tài chính',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) { }

  @Get('monthly-finances/me')
  @ResponseMessage('Lấy thông tin tài chính tháng thành công')
  @ApiOperation({
    summary: 'Lấy thông tin tài chính tháng của thành viên hiện tại',
  })
  @ApiResponse({
    status: 200,
    description: 'Thông tin tài chính tháng hoặc null nếu chưa khai báo',
  })
  getMyMonthlyFinance(
    @CurrentFamilyMember('id') memberId: string,
    @Query() period: RequiredFinancePeriodDto,
  ) {
    return this.financeService.getMyMonthlyFinance(memberId, period);
  }

  @Post('monthly-finances/me')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo thông tin tài chính tháng thành công')
  @ApiOperation({
    summary: 'Tạo thông tin tài chính tháng cho thành viên hiện tại',
  })
  @ApiResponse({
    status: 409,
    description: 'Thông tin tài chính của tháng này đã tồn tại',
  })
  createMyMonthlyFinance(
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateMemberMonthlyFinanceDto,
  ) {
    return this.financeService.createMyMonthlyFinance(memberId, dto);
  }

  @Put('monthly-finances/me')
  @ResponseMessage('Cập nhật thông tin tài chính tháng thành công')
  @ApiOperation({
    summary: 'Cập nhật thông tin tài chính tháng của thành viên hiện tại',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy thông tin tài chính của tháng này',
  })
  updateMyMonthlyFinance(
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: UpdateMemberMonthlyFinanceDto,
  ) {
    return this.financeService.updateMyMonthlyFinance(memberId, dto);
  }

  @Get('model-templates')
  @ResponseMessage('Lấy danh sách mẫu mô hình tài chính thành công')
  @ApiOperation({
    summary: 'Lấy các mẫu mô hình tài chính có sẵn trong hệ thống',
    description:
      'Templates được khai báo bằng constant và không được lưu trong database.',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách FIVE_JARS, EIGHTY_TWENTY và CUSTOM templates',
  })
  listFinanceModelTemplates() {
    return this.financeService.listFinanceModelTemplates();
  }

  @Get('models')
  @ResponseMessage('Lấy danh sách mô hình tài chính thành công')
  @ApiOperation({
    summary:
      'Lấy mô hình tài chính; thành viên thường chỉ thấy mô hình đang hoạt động',
  })
  listFinanceModels(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
  ) {
    return this.financeService.listFinanceModels(familyId, familyRole);
  }

  @Post('models')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo mô hình tài chính thành công')
  @ApiOperation({
    summary: 'Tạo mô hình tài chính và các hũ mặc định cho mô hình chuẩn',
  })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền quản lý tài chính gia đình',
  })
  createFinanceModel(
    @Param('familyId') familyId: string,
    @Body() dto: CreateFinanceModelDto,
  ) {
    return this.financeService.createFinanceModel(familyId, dto);
  }

  @Patch('models/:modelId/activate')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Kích hoạt mô hình tài chính thành công')
  @ApiOperation({
    summary: 'Kích hoạt mô hình tài chính và vô hiệu hóa mô hình cũ',
  })
  @ApiParam({ name: 'modelId', format: 'uuid' })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền quản lý tài chính gia đình',
  })
  activateFinanceModel(
    @Param('familyId') familyId: string,
    @Param('modelId') modelId: string,
  ) {
    return this.financeService.activateFinanceModel(familyId, modelId);
  }

  @Get('jars')
  @ResponseMessage('Lấy danh sách hũ tài chính thành công')
  @ApiOperation({
    summary:
      'Lấy hũ tài chính; thành viên thường chỉ thấy hũ của mô hình đang hoạt động',
  })
  listFinanceJars(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
  ) {
    return this.financeService.listFinanceJars(familyId, familyRole);
  }

  @Post('jars')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo hũ tài chính thành công')
  @ApiOperation({ summary: 'Tạo hũ tài chính thuộc một mô hình của gia đình' })
  @ApiResponse({
    status: 400,
    description: 'Tổng tỷ lệ phân bổ của các hũ hoạt động vượt quá 100%',
  })
  createFinanceJar(
    @Param('familyId') familyId: string,
    @Body() dto: CreateFinanceJarDto,
  ) {
    return this.financeService.createFinanceJar(familyId, dto);
  }

  @Patch('jars/:jarId')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Cập nhật hũ tài chính thành công')
  @ApiOperation({ summary: 'Cập nhật hũ tài chính của gia đình' })
  @ApiParam({ name: 'jarId', format: 'uuid' })
  @ApiResponse({
    status: 400,
    description: 'Tổng tỷ lệ phân bổ của các hũ hoạt động vượt quá 100%',
  })
  updateFinanceJar(
    @Param('familyId') familyId: string,
    @Param('jarId') jarId: string,
    @Body() dto: UpdateFinanceJarDto,
  ) {
    return this.financeService.updateFinanceJar(familyId, jarId, dto);
  }

  @Get('categories')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Lấy danh sách danh mục tài chính thành công')
  @ApiOperation({ summary: 'Lấy danh sách danh mục tài chính của gia đình' })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền quản lý tài chính gia đình',
  })
  listCategories(@Param('familyId') familyId: string) {
    return this.financeService.listCategories(familyId);
  }

  @Post('categories')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo danh mục tài chính thành công')
  @ApiOperation({ summary: 'Tạo danh mục tài chính cho gia đình' })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền quản lý tài chính gia đình',
  })
  @ApiResponse({
    status: 409,
    description: 'Danh mục tài chính đang hoạt động với tên này đã tồn tại',
  })
  createCategory(
    @Param('familyId') familyId: string,
    @Body() dto: CreateFinanceCategoryDto,
  ) {
    return this.financeService.createCategory(familyId, dto);
  }

  @Get('support-requests')
  @ResponseMessage('Lấy danh sách yêu cầu hỗ trợ chi tiêu thành công')
  @ApiOperation({ summary: 'Lấy danh sách yêu cầu hỗ trợ chi tiêu có thể xem' })
  @ApiQuery({
    name: 'mine',
    required: false,
    type: Boolean,
    description: 'Chỉ lấy yêu cầu của thành viên hiện tại',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách yêu cầu hỗ trợ chi tiêu',
  })
  listSpendingSupportRequests(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() query: SpendingSupportRequestQueryDto,
  ) {
    return this.financeService.listSpendingSupportRequests(
      familyId,
      memberId,
      query,
    );
  }

  @Post('support-requests')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo yêu cầu hỗ trợ chi tiêu thành công')
  @ApiOperation({ summary: 'Tạo yêu cầu hỗ trợ chi tiêu cho bản thân' })
  @ApiResponse({
    status: 201,
    description: 'Yêu cầu hỗ trợ chi tiêu đã được tạo',
  })
  createSpendingSupportRequest(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateSpendingSupportRequestDto,
  ) {
    return this.financeService.createSpendingSupportRequest(
      familyId,
      memberId,
      dto,
    );
  }

  @Get('support-requests/:requestId')
  @ResponseMessage('Lấy yêu cầu hỗ trợ chi tiêu thành công')
  @ApiOperation({ summary: 'Lấy chi tiết yêu cầu hỗ trợ chi tiêu' })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy yêu cầu hỗ trợ chi tiêu',
  })
  getSpendingSupportRequest(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.financeService.getSpendingSupportRequest(
      familyId,
      memberId,
      requestId,
    );
  }

  @Patch('support-requests/:requestId/review')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Duyệt yêu cầu hỗ trợ chi tiêu thành công')
  @ApiOperation({ summary: 'Phê duyệt hoặc từ chối yêu cầu hỗ trợ chi tiêu' })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiResponse({
    status: 409,
    description: 'Yêu cầu hỗ trợ chi tiêu đã được xử lý',
  })
  reviewSpendingSupportRequest(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('requestId') requestId: string,
    @Body() dto: ReviewSpendingSupportRequestDto,
  ) {
    return this.financeService.reviewSpendingSupportRequest(
      familyId,
      memberId,
      requestId,
      dto,
    );
  }

  @Patch('support-requests/:requestId/cancel')
  @ResponseMessage('Hủy yêu cầu hỗ trợ chi tiêu thành công')
  @ApiOperation({
    summary: 'Hủy yêu cầu hỗ trợ chi tiêu đang chờ của bản thân',
  })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiResponse({
    status: 409,
    description: 'Yêu cầu hỗ trợ chi tiêu đã được xử lý',
  })
  cancelSpendingSupportRequest(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.financeService.cancelSpendingSupportRequest(
      familyId,
      memberId,
      requestId,
    );
  }

  @Get('alerts')
  @ResponseMessage('Lấy danh sách cảnh báo tài chính thành công')
  @ApiOperation({ summary: 'Lấy danh sách cảnh báo tài chính có thể xem' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Lọc theo trạng thái cảnh báo',
  })
  @ApiResponse({ status: 200, description: 'Danh sách cảnh báo tài chính' })
  listBudgetAlerts(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() query: BudgetAlertQueryDto,
  ) {
    return this.financeService.listBudgetAlerts(familyId, memberId, query);
  }

  @Get('alerts/:alertId')
  @ResponseMessage('Lấy cảnh báo tài chính thành công')
  @ApiOperation({ summary: 'Lấy chi tiết cảnh báo tài chính' })
  @ApiParam({ name: 'alertId', format: 'uuid' })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy cảnh báo tài chính',
  })
  getBudgetAlert(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('alertId') alertId: string,
  ) {
    return this.financeService.getBudgetAlert(familyId, memberId, alertId);
  }

  @Post('alerts/recompute')
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
    return this.financeService.recomputeBudgetGoalAlerts(
      familyId,
      memberId,
      dto,
    );
  }

  @Patch('alerts/:alertId/acknowledge')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Xác nhận cảnh báo tài chính thành công')
  @ApiOperation({ summary: 'Xác nhận đã xem cảnh báo tài chính' })
  @ApiParam({ name: 'alertId', format: 'uuid' })
  @ApiResponse({ status: 400, description: 'Cảnh báo đã được giải quyết' })
  acknowledgeBudgetAlert(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('alertId') alertId: string,
  ) {
    return this.financeService.acknowledgeBudgetAlert(
      familyId,
      memberId,
      alertId,
    );
  }

  @Patch('alerts/:alertId/resolve')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Giải quyết cảnh báo tài chính thành công')
  @ApiOperation({ summary: 'Đánh dấu cảnh báo tài chính đã được giải quyết' })
  @ApiParam({ name: 'alertId', format: 'uuid' })
  @ApiResponse({ status: 409, description: 'Cảnh báo đã được giải quyết' })
  resolveBudgetAlert(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('alertId') alertId: string,
    @Body() dto: ResolveBudgetAlertDto,
  ) {
    return this.financeService.resolveBudgetAlert(
      familyId,
      memberId,
      alertId,
      dto,
    );
  }

  @Get('reports/overview')
  @ResponseMessage('Lấy báo cáo tổng quan tài chính thành công')
  @ApiOperation({ summary: 'Lấy báo cáo tổng quan tài chính gia đình' })
  @ApiQuery({ name: 'budgetPlanId', required: false, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Báo cáo tổng quan tài chính' })
  getFinanceOverviewReport(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() query: FinanceReportQueryDto,
  ) {
    return this.financeService.getFinanceOverviewReport(
      familyId,
      memberId,
      query,
    );
  }

  @Get('reports/budget-goal')
  @ResponseMessage('Lấy báo cáo ngân sách và mục tiêu thành công')
  @ApiOperation({ summary: 'Lấy báo cáo ngân sách, mục tiêu và cảnh báo' })
  @ApiQuery({ name: 'budgetPlanId', required: false, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Báo cáo ngân sách và mục tiêu' })
  getBudgetGoalReport(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() query: FinanceReportQueryDto,
  ) {
    return this.financeService.getBudgetGoalReport(familyId, memberId, query);
  }

  @Get('reports/non-essential-spending')
  @ResponseMessage('Lấy báo cáo chi tiêu không thiết yếu thành công')
  @ApiOperation({ summary: 'Lấy báo cáo chi tiêu không thiết yếu' })
  @ApiQuery({ name: 'budgetPlanId', required: false, format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Báo cáo chi tiêu không thiết yếu',
  })
  getNonEssentialSpendingReport(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() query: FinanceReportQueryDto,
  ) {
    return this.financeService.getNonEssentialSpendingReport(
      familyId,
      memberId,
      query,
    );
  }

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
  @ApiParam({ name: 'goalId', format: 'uuid' })
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
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Cập nhật mục tiêu tài chính thành công')
  @ApiOperation({ summary: 'Cập nhật mục tiêu tài chính gia đình' })
  @ApiParam({ name: 'goalId', format: 'uuid' })
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
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Hủy mục tiêu tài chính thành công')
  @ApiOperation({ summary: 'Hủy mục tiêu tài chính gia đình' })
  @ApiParam({ name: 'goalId', format: 'uuid' })
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
  @ApiOperation({ summary: 'Lấy tiến độ tính toán của mục tiêu tài chính' })
  @ApiParam({ name: 'goalId', format: 'uuid' })
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
  @ResponseMessage('Lay goi y dong gop muc tieu thanh cong')
  @ApiOperation({
    summary:
      'Tính gợi ý đóng góp hằng tháng của mỗi thành viên cho mục tiêu tài chính',
  })
  @ApiParam({ name: 'goalId', format: 'uuid' })
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
  @ApiParam({ name: 'goalId', format: 'uuid' })
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
  @ApiParam({ name: 'goalId', format: 'uuid' })
  @ApiParam({ name: 'planId', format: 'uuid' })
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
    summary: 'Manager/deputy phê duyệt khoản đóng góp và ghi vào sổ sách tài chính',
  })
  @ApiParam({ name: 'goalId', format: 'uuid' })
  @ApiParam({ name: 'planId', format: 'uuid' })
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
  @ApiParam({ name: 'goalId', format: 'uuid' })
  @ApiParam({ name: 'planId', format: 'uuid' })
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
    summary: 'Lấy kế hoạch và thực tế đóng góp mục tiêu thành công',
  })
  @ApiParam({ name: 'goalId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Planned vs actual theo thành viên',
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
    summary: 'Lấy tổng thiếu hụt đóng góp mục tiêu theo tháng',
  })
  @ApiParam({ name: 'goalId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Tổng thiếu hụt đóng góp mục tiêu' })
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
  @ApiParam({ name: 'goalId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Danh sách phân bổ mục tiêu' })
  listGoalAllocations(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Param('goalId') goalId: string,
  ) {
    return this.financeService.listGoalAllocations(familyId, memberId, goalId);
  }

  @Post('financial-goals/:goalId/allocations')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Phân bổ giao dịch vào mục tiêu thành công')
  @ApiOperation({
    summary: 'Phân bổ một phần giao dịch vào mục tiêu tài chính',
  })
  @ApiParam({ name: 'goalId', format: 'uuid' })
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
  @ResponseMessage('Cập nhật phân bổ mục tiêu thành công')
  @ApiOperation({ summary: 'Cập nhật số tiền phân bổ vào mục tiêu' })
  @ApiParam({ name: 'allocationId', format: 'uuid' })
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
  @ResponseMessage('Xóa phân bổ mục tiêu thành công')
  @ApiOperation({ summary: 'Xóa phân bổ khỏi mục tiêu tài chính' })
  @ApiParam({ name: 'allocationId', format: 'uuid' })
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
  @ApiParam({ name: 'budgetPlanId', format: 'uuid' })
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
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Cập nhật kế hoạch ngân sách thành công')
  @ApiOperation({
    summary: 'Cập nhật kế hoạch ngân sách đang ở trạng thái DRAFT',
  })
  @ApiParam({ name: 'budgetPlanId', format: 'uuid' })
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
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Kích hoạt kế hoạch ngân sách thành công')
  @ApiOperation({ summary: 'Kích hoạt kế hoạch ngân sách' })
  @ApiParam({ name: 'budgetPlanId', format: 'uuid' })
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
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Đóng kế hoạch ngân sách thành công')
  @ApiOperation({ summary: 'Đóng kế hoạch ngân sách đang hoạt động' })
  @ApiParam({ name: 'budgetPlanId', format: 'uuid' })
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
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Hủy kế hoạch ngân sách thành công')
  @ApiOperation({ summary: 'Hủy kế hoạch ngân sách DRAFT hoặc ACTIVE' })
  @ApiParam({ name: 'budgetPlanId', format: 'uuid' })
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
  @ApiParam({ name: 'budgetPlanId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Báo cáo planned-vs-actual' })
  getBudgetPlanReport(
    @Param('familyId') familyId: string,
    @Param('budgetPlanId') budgetPlanId: string,
  ) {
    return this.financeService.getBudgetPlanReport(familyId, budgetPlanId);
  }

  @Post('budget-plans/:budgetPlanId/lines')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo dòng ngân sách thành công')
  @ApiOperation({ summary: 'Thêm dòng vào kế hoạch ngân sách DRAFT' })
  @ApiParam({ name: 'budgetPlanId', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Dòng ngân sách đã được tạo' })
  createBudgetLine(
    @Param('familyId') familyId: string,
    @Param('budgetPlanId') budgetPlanId: string,
    @Body() dto: CreateBudgetLineDto,
  ) {
    return this.financeService.createBudgetLine(familyId, budgetPlanId, dto);
  }

  @Patch('budget-lines/:budgetLineId')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Cập nhật dòng ngân sách thành công')
  @ApiOperation({ summary: 'Cập nhật dòng ngân sách thuộc kế hoạch DRAFT' })
  @ApiParam({ name: 'budgetLineId', format: 'uuid' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy dòng ngân sách' })
  updateBudgetLine(
    @Param('familyId') familyId: string,
    @Param('budgetLineId') budgetLineId: string,
    @Body() dto: UpdateBudgetLineDto,
  ) {
    return this.financeService.updateBudgetLine(familyId, budgetLineId, dto);
  }

  @Delete('budget-lines/:budgetLineId')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Xóa dòng ngân sách thành công')
  @ApiOperation({ summary: 'Xóa dòng ngân sách thuộc kế hoạch DRAFT' })
  @ApiParam({ name: 'budgetLineId', format: 'uuid' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy dòng ngân sách' })
  deleteBudgetLine(
    @Param('familyId') familyId: string,
    @Param('budgetLineId') budgetLineId: string,
  ) {
    return this.financeService.deleteBudgetLine(familyId, budgetLineId);
  }

  @Get('ledger/entries')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Lấy danh sách giao dịch sổ tài chính chung thành công')
  @ApiOperation({ summary: 'Lấy danh sách giao dịch trong sổ tài chính chung' })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền quản lý tài chính gia đình',
  })
  listLedgerEntries(
    @Param('familyId') familyId: string,
    @Query() period: OptionalFinancePeriodDto,
  ) {
    return this.financeService.listLedgerEntries(familyId, period);
  }

  @Post('ledger/entries')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo giao dịch trong sổ tài chính chung thành công')
  @ApiOperation({
    summary: 'Tạo giao dịch nội bộ trong sổ tài chính chung của gia đình',
  })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền quản lý tài chính gia đình',
  })
  createLedgerEntry(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateLedgerEntryDto,
  ) {
    return this.financeService.createLedgerEntry(familyId, memberId, dto);
  }

  @Get('overview')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Lấy tổng quan tài chính gia đình thành công')
  @ApiOperation({
    summary:
      'Lấy tổng quan sổ tài chính chung và thông tin tháng của thành viên hiện tại',
  })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền quản lý tài chính gia đình',
  })
  getOverview(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() period: OptionalFinancePeriodDto,
  ) {
    return this.financeService.getOverview(familyId, memberId, period);
  }
}
