import {
  Body,
  Controller,
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
import { CreateSpendingSupportRequestDto } from '../dto/create-spending-support-request.dto';
import { ReviewSpendingSupportRequestDto } from '../dto/review-spending-support-request.dto';
import { SpendingSupportRequestQueryDto } from '../dto/spending-support-request-query.dto';
import { FinanceService } from '../services/finance.service';

@ApiTags('Finance - Hỗ trợ chi tiêu')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình cần truy cập tài chính',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/finance')
export class FinanceSupportRequestsController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('support-requests')
  @ResponseMessage('Lấy danh sách yêu cầu hỗ trợ chi tiêu thành công')
  @ApiOperation({ summary: 'Lấy danh sách yêu cầu hỗ trợ chi tiêu có thể xem' })
  @ApiQuery({
    name: 'mine',
    required: false,
    type: Boolean,
    example: true,
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
  @UseGuards(VerifiedGuard)
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
  @ApiParam({
    name: 'requestId',
    description: 'ID yêu cầu hỗ trợ chi tiêu cần thao tác',
    format: 'uuid',
  })
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
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Duyệt yêu cầu hỗ trợ chi tiêu thành công')
  @ApiOperation({ summary: 'Phê duyệt hoặc từ chối yêu cầu hỗ trợ chi tiêu' })
  @ApiParam({
    name: 'requestId',
    description: 'ID yêu cầu hỗ trợ chi tiêu cần thao tác',
    format: 'uuid',
  })
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
  @UseGuards(VerifiedGuard)
  @ResponseMessage('Hủy yêu cầu hỗ trợ chi tiêu thành công')
  @ApiOperation({
    summary: 'Hủy yêu cầu hỗ trợ chi tiêu đang chờ của bản thân',
  })
  @ApiParam({
    name: 'requestId',
    description: 'ID yêu cầu hỗ trợ chi tiêu cần thao tác',
    format: 'uuid',
  })
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
}
