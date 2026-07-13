import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
import { FamilyRoles } from '../../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../../family-members/guards/family-permission.guard';
import { FINANCE_MANAGER_ROLES } from './finance-controller.constants';
import { CreateFinanceCategoryDto } from '../dto/create-finance-category.dto';
import { FinanceService } from '../services/finance.service';

@ApiTags('Finance - Danh mục thu chi')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình cần truy cập tài chính',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/finance')
export class FinanceCategoriesController {
  constructor(private readonly financeService: FinanceService) {}

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
  @UseGuards(VerifiedGuard)
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
}
