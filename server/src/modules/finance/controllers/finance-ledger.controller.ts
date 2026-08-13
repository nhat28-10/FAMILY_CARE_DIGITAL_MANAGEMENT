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
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
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
import { CreateLedgerEntryDto } from '../dto/create-ledger-entry.dto';
import {
  FINANCE_OVERVIEW_RESPONSE_EXAMPLE,
  FinanceBadRequestResponseDto,
  FinanceForbiddenResponseDto,
  FinanceOverviewApiResponseDto,
} from '../dto/finance-summary-response.dto';
import { LedgerEntryQueryDto } from '../dto/ledger-entry-query.dto';
import { OptionalFinancePeriodDto } from '../dto/finance-period.dto';
import { UpdateLedgerEntryDto } from '../dto/update-ledger-entry.dto';
import { FinanceService } from '../services/finance.service';

@ApiTags('Finance - Thu chi gia đình')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình cần truy cập tài chính',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/finance')
export class FinanceLedgerController {
  constructor(private readonly financeService: FinanceService) {}

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
    @Query() query: LedgerEntryQueryDto,
  ) {
    return this.financeService.listLedgerEntries(familyId, query);
  }

  @Post('ledger/entries')
  @UseGuards(VerifiedGuard)
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

  @Get('ledger/entries/:entryId')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Lấy chi tiết giao dịch sổ tài chính chung thành công')
  @ApiOperation({
    summary: 'Lấy chi tiết một giao dịch trong sổ tài chính chung',
  })
  @ApiParam({
    name: 'entryId',
    description: 'ID giao dịch cần thao tác',
    format: 'uuid',
  })
  getLedgerEntry(
    @Param('familyId') familyId: string,
    @Param('entryId') entryId: string,
  ) {
    return this.financeService.getLedgerEntry(familyId, entryId);
  }

  @Patch('ledger/entries/:entryId')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Cập nhật giao dịch sổ tài chính chung thành công')
  @ApiOperation({ summary: 'Cập nhật giao dịch trong sổ tài chính chung' })
  @ApiParam({
    name: 'entryId',
    description: 'ID giao dịch cần thao tác',
    format: 'uuid',
  })
  updateLedgerEntry(
    @Param('familyId') familyId: string,
    @Param('entryId') entryId: string,
    @Body() dto: UpdateLedgerEntryDto,
  ) {
    return this.financeService.updateLedgerEntry(familyId, entryId, dto);
  }

  @Delete('ledger/entries/:entryId')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Hủy giao dịch sổ tài chính chung thành công')
  @ApiOperation({
    summary:
      'Hủy mềm giao dịch trong sổ tài chính chung bằng trạng thái VOIDED',
  })
  @ApiParam({
    name: 'entryId',
    description: 'ID giao dịch cần thao tác',
    format: 'uuid',
  })
  voidLedgerEntry(
    @Param('familyId') familyId: string,
    @Param('entryId') entryId: string,
  ) {
    return this.financeService.voidLedgerEntry(familyId, entryId);
  }

  @Get('overview')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Lấy tổng quan tài chính gia đình thành công')
  @ApiOperation({
    summary: 'Lấy tổng quan nhanh tài chính hiện tại',
    description:
      'Trả snapshot nhanh của sổ tài chính chung và thông tin tháng của thành viên hiện tại.',
  })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền quản lý tài chính gia đình',
  })
  @ApiOkResponse({
    description:
      'Envelope chuẩn. data.period dùng month/year; các số tiền là VND; monthlyFinance có thể null.',
    type: FinanceOverviewApiResponseDto,
    examples: {
      sample: {
        summary: 'Finance overview sample',
        value: FINANCE_OVERVIEW_RESPONSE_EXAMPLE,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'month/year không hợp lệ',
    type: FinanceBadRequestResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Không có quyền quản lý tài chính gia đình',
    type: FinanceForbiddenResponseDto,
  })
  getOverview(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() period: OptionalFinancePeriodDto,
  ) {
    return this.financeService.getOverview(familyId, memberId, period);
  }
}
