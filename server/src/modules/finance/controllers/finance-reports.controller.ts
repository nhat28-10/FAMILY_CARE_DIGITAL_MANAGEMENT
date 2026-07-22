import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentFamilyMember } from '../../family-members/decorators/current-family-member.decorator';
import { FamilyPermissionGuard } from '../../family-members/guards/family-permission.guard';
import { FinanceReportQueryDto } from '../dto/finance-report-query.dto';
import {
  CASH_FLOW_SUMMARY_RESPONSE_EXAMPLE,
  CATEGORY_SPENDING_SUMMARY_RESPONSE_EXAMPLE,
  CashFlowSummaryApiResponseDto,
  CategorySpendingSummaryApiResponseDto,
  FINANCE_SUMMARY_RESPONSE_EXAMPLE,
  FinanceBadRequestResponseDto,
  FinanceForbiddenResponseDto,
  FinanceSummaryApiResponseDto,
  MEMBER_CONTRIBUTION_SUMMARY_RESPONSE_EXAMPLE,
  MemberContributionSummaryApiResponseDto,
} from '../dto/finance-summary-response.dto';
import { FinanceReportService } from '../services/finance-report.service';

@ApiTags('Finance - Báo cáo tài chính')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình cần truy cập tài chính',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/finance')
export class FinanceReportsController {
  constructor(private readonly financeReportService: FinanceReportService) {}

  @Get('summary')
  @ResponseMessage('Lấy tóm tắt tài chính gia đình thành công')
  @ApiOperation({
    summary: 'Lấy tóm tắt tài chính gia đình cho màn hình tổng quan',
  })
  @ApiQuery({
    name: 'budgetPlanId',
    required: false,
    format: 'uuid',
    description: 'ID kế hoạch ngân sách cần phân tích',
  })
  @ApiOkResponse({
    description:
      'Envelope chuẩn. data chứa period, currency=VND, budget/goals/spending/alerts. goals/alerts có thể null theo query include*. Các mảng rỗng trả [].',
    type: FinanceSummaryApiResponseDto,
    examples: {
      sample: {
        summary: 'Finance summary sample',
        value: FINANCE_SUMMARY_RESPONSE_EXAMPLE,
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'periodStart/periodEnd không hợp lệ hoặc budgetPlanId không hợp lệ',
    type: FinanceBadRequestResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Không có quyền truy cập family workspace',
    type: FinanceForbiddenResponseDto,
  })
  getFamilyFinanceSummary(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() query: FinanceReportQueryDto,
  ) {
    return this.financeReportService.getFamilyFinanceSummary(
      familyId,
      memberId,
      query,
    );
  }

  @Get('cash-flow-summary')
  @ResponseMessage('Lấy tóm tắt dòng tiền gia đình thành công')
  @ApiOperation({
    summary: 'Lấy tóm tắt dòng tiền vào/ra theo tháng',
  })
  @ApiOkResponse({
    description:
      'Envelope chuẩn. data.totals và data.byMonth dùng VND; byMonth là [] khi không có giao dịch.',
    type: CashFlowSummaryApiResponseDto,
    examples: {
      sample: {
        summary: 'Cash flow summary sample',
        value: CASH_FLOW_SUMMARY_RESPONSE_EXAMPLE,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'periodStart/periodEnd hoặc budgetPlanId không hợp lệ',
    type: FinanceBadRequestResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Không có quyền truy cập family workspace',
    type: FinanceForbiddenResponseDto,
  })
  getCashFlowSummary(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() query: FinanceReportQueryDto,
  ) {
    return this.financeReportService.getCashFlowSummary(
      familyId,
      memberId,
      query,
    );
  }

  @Get('category-spending-summary')
  @ResponseMessage('Lấy tóm tắt chi tiêu theo danh mục thành công')
  @ApiOperation({
    summary: 'Lấy thống kê chi tiêu theo danh mục',
  })
  @ApiOkResponse({
    description:
      'Envelope chuẩn. data.byCategory là [] khi không có chi tiêu; amount/totals dùng VND; ratio là phần trăm.',
    type: CategorySpendingSummaryApiResponseDto,
    examples: {
      sample: {
        summary: 'Category spending summary sample',
        value: CATEGORY_SPENDING_SUMMARY_RESPONSE_EXAMPLE,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'periodStart/periodEnd hoặc budgetPlanId không hợp lệ',
    type: FinanceBadRequestResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Không có quyền truy cập family workspace',
    type: FinanceForbiddenResponseDto,
  })
  getCategorySpendingSummary(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() query: FinanceReportQueryDto,
  ) {
    return this.financeReportService.getCategorySpendingSummary(
      familyId,
      memberId,
      query,
    );
  }

  @Get('member-contribution-summary')
  @ResponseMessage('Lấy tóm tắt đóng góp theo thành viên thành công')
  @ApiOperation({
    summary: 'Lấy thống kê đóng góp quỹ chung và mục tiêu theo thành viên',
  })
  @ApiOkResponse({
    description:
      'Envelope chuẩn. Manager/deputy thấy mọi active member; member thường chỉ thấy chính mình. members là [] nếu không có member khả kiến.',
    type: MemberContributionSummaryApiResponseDto,
    examples: {
      sample: {
        summary: 'Member contribution summary sample',
        value: MEMBER_CONTRIBUTION_SUMMARY_RESPONSE_EXAMPLE,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'periodStart/periodEnd hoặc budgetPlanId không hợp lệ',
    type: FinanceBadRequestResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Không có quyền truy cập family workspace',
    type: FinanceForbiddenResponseDto,
  })
  getMemberContributionSummary(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() query: FinanceReportQueryDto,
  ) {
    return this.financeReportService.getMemberContributionSummary(
      familyId,
      memberId,
      query,
    );
  }

  @Get('reports/overview')
  @ResponseMessage('Lấy báo cáo tổng quan tài chính thành công')
  @ApiOperation({
    summary: 'Lấy báo cáo phân tích tổng quan tài chính',
    description:
      'Báo cáo phân tích budget, goals, spending và alerts; khác với /finance/overview là snapshot nhanh hiện tại.',
  })
  @ApiQuery({
    name: 'budgetPlanId',
    required: false,
    format: 'uuid',
    description: 'ID kế hoạch ngân sách cần phân tích',
  })
  @ApiResponse({ status: 200, description: 'Báo cáo tổng quan tài chính' })
  getFinanceOverviewReport(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() query: FinanceReportQueryDto,
  ) {
    return this.financeReportService.getFinanceOverviewReport(
      familyId,
      memberId,
      query,
    );
  }

  @Get('reports/budget-goal')
  @ResponseMessage('Lấy báo cáo ngân sách và mục tiêu thành công')
  @ApiOperation({ summary: 'Lấy báo cáo ngân sách, mục tiêu và cảnh báo' })
  @ApiQuery({
    name: 'budgetPlanId',
    required: false,
    format: 'uuid',
    description: 'ID kế hoạch ngân sách cần phân tích',
  })
  @ApiResponse({ status: 200, description: 'Báo cáo ngân sách và mục tiêu' })
  getBudgetGoalReport(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() query: FinanceReportQueryDto,
  ) {
    return this.financeReportService.getBudgetGoalReport(
      familyId,
      memberId,
      query,
    );
  }

  @Get('reports/non-essential-spending')
  @ResponseMessage('Lấy báo cáo chi tiêu không thiết yếu thành công')
  @ApiOperation({ summary: 'Lấy báo cáo chi tiêu không thiết yếu' })
  @ApiQuery({
    name: 'budgetPlanId',
    required: false,
    format: 'uuid',
    description: 'ID kế hoạch ngân sách cần phân tích',
  })
  @ApiResponse({
    status: 200,
    description: 'Báo cáo chi tiêu không thiết yếu',
  })
  getNonEssentialSpendingReport(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() query: FinanceReportQueryDto,
  ) {
    return this.financeReportService.getNonEssentialSpendingReport(
      familyId,
      memberId,
      query,
    );
  }
}
