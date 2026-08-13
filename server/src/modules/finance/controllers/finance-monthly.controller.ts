import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
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
import { CurrentFamilyMember } from '../../family-members/decorators/current-family-member.decorator';
import { FamilyRoles } from '../../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../../family-members/guards/family-permission.guard';
import { FINANCE_MANAGER_ROLES } from './finance-controller.constants';
import { RequiredFinancePeriodDto } from '../dto/finance-period.dto';
import { CreateMemberMonthlyFinanceDto } from '../dto/create-member-monthly-finance.dto';
import { UpdateMemberMonthlyFinanceDto } from '../dto/update-member-monthly-finance.dto';
import { FinanceService } from '../services/finance.service';

@ApiTags('Finance - Tài chính theo tháng')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình cần truy cập tài chính',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/finance')
export class FinanceMonthlyController {
  constructor(private readonly financeService: FinanceService) {}

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

  @Get('monthly-finances/members/:memberId')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Lấy thông tin tài chính tháng của thành viên thành công')
  @ApiOperation({
    summary: 'Quản lý lấy thông tin tài chính tháng của thành viên khác',
    description:
      'Tôn trọng incomeVisibility và expenseVisibility; trường private được trả về null.',
  })
  @ApiParam({
    name: 'memberId',
    description: 'ID thành viên cần xem thông tin tài chính',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Thông tin tài chính tháng đã được ẩn các trường riêng tư',
  })
  getMemberMonthlyFinance(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') viewerMemberId: string,
    @Param('memberId') memberId: string,
    @Query() period: RequiredFinancePeriodDto,
  ) {
    return this.financeService.getMemberMonthlyFinance(
      familyId,
      viewerMemberId,
      memberId,
      period,
    );
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

  @Get('monthly-summary/me')
  @ResponseMessage('Lấy tổng quan tài chính tháng của tôi thành công')
  @ApiOperation({
    summary: 'Lấy tổng quan tài chính tháng của thành viên hiện tại',
    description:
      'Gồm khai báo thu chi tháng, đóng góp quỹ gia đình và đóng góp mục tiêu tài chính.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tổng quan tài chính tháng của thành viên hiện tại',
  })
  getMyMonthlySummary(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() period: RequiredFinancePeriodDto,
  ) {
    return this.financeService.getMyMonthlySummary(familyId, memberId, period);
  }

  @Get('monthly-summary/members/:memberId')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Lấy tổng quan tài chính tháng của thành viên thành công')
  @ApiOperation({
    summary: 'Quản lý lấy tổng quan tài chính tháng của thành viên khác',
    description:
      'Gồm thu chi tháng, đóng góp quỹ gia đình và đóng góp mục tiêu; income/expense private được trả về null.',
  })
  @ApiParam({
    name: 'memberId',
    description: 'ID thành viên cần xem thông tin tài chính',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Tổng quan tài chính tháng đã ẩn thông tin riêng tư',
  })
  getMemberMonthlySummary(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') viewerMemberId: string,
    @Param('memberId') memberId: string,
    @Query() period: RequiredFinancePeriodDto,
  ) {
    return this.financeService.getMemberMonthlySummary(
      familyId,
      viewerMemberId,
      memberId,
      period,
    );
  }
}
