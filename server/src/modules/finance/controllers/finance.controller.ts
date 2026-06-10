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
import { FamilyRole } from '@prisma/client';
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
import { CreateFinanceCategoryDto } from '../dto/create-finance-category.dto';
import { CreateLedgerEntryDto } from '../dto/create-ledger-entry.dto';
import { CreateMemberMonthlyFinanceDto } from '../dto/create-member-monthly-finance.dto';
import {
  OptionalFinancePeriodDto,
  RequiredFinancePeriodDto,
} from '../dto/finance-period.dto';
import { UpdateMemberMonthlyFinanceDto } from '../dto/update-member-monthly-finance.dto';
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
