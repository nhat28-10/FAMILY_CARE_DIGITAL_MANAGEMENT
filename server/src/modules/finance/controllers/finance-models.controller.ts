import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { VerifiedGuard } from '../../auth/guards/verified.guard';
import { CurrentFamilyMember } from '../../family-members/decorators/current-family-member.decorator';
import { FamilyRoles } from '../../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../../family-members/guards/family-permission.guard';
import { FINANCE_MANAGER_ROLES } from './finance-controller.constants';
import { CreateFundAllocationDto } from '../dto/create-fund-allocation.dto';
import { CreateFinanceJarDto } from '../dto/create-finance-jar.dto';
import { CreateFinanceModelDto } from '../dto/create-finance-model.dto';
import { UpdateFinanceJarDto } from '../dto/update-finance-jar.dto';
import { FinanceService } from '../services/finance.service';

@ApiTags('Finance - Mô hình và hũ tài chính')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình cần truy cập tài chính',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/finance')
export class FinanceModelsController {
  constructor(private readonly financeService: FinanceService) {}

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
  @UseGuards(VerifiedGuard)
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
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Kích hoạt mô hình tài chính thành công')
  @ApiOperation({
    summary: 'Kích hoạt mô hình tài chính và vô hiệu hóa mô hình cũ',
  })
  @ApiParam({
    name: 'modelId',
    description: 'ID mô hình tài chính cần thao tác',
    format: 'uuid',
  })
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

  @Post('fund-allocations')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Chia quy theo mo hinh tai chinh thanh cong')
  @ApiOperation({
    summary: 'Chia quy gia dinh theo ty le cac hu cua mo hinh tai chinh',
    description:
      'Neu khong truyen modelId, he thong dung mo hinh ACTIVE cua gia dinh. Moi hu duoc ghi thanh mot ledger entry co jarId.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Mo hinh khong co hu hoat dong hoac tong ty le hu khong bang 100%',
  })
  @ApiResponse({
    status: 409,
    description: 'Ky nay da co lan chia quy theo mo hinh nay',
  })
  allocateFundByModel(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateFundAllocationDto,
  ) {
    return this.financeService.allocateFundByModel(familyId, memberId, dto);
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
  @UseGuards(VerifiedGuard)
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
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Cập nhật hũ tài chính thành công')
  @ApiOperation({ summary: 'Cập nhật hũ tài chính của gia đình' })
  @ApiParam({
    name: 'jarId',
    description: 'ID hũ tài chính cần thao tác',
    format: 'uuid',
  })
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
}
