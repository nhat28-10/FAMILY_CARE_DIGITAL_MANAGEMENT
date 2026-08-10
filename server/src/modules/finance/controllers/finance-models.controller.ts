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
import { FamilyRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
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
import {
  CATEGORY_JAR_MAPPING_DELETE_RESPONSE_EXAMPLE,
  CATEGORY_JAR_MAPPING_DETAIL_RESPONSE_EXAMPLE,
  CATEGORY_JAR_MAPPING_LIST_RESPONSE_EXAMPLE,
  CategoryJarMappingDeleteApiResponseDto,
  CategoryJarMappingDetailApiResponseDto,
  CategoryJarMappingListApiResponseDto,
  FinanceCategoryJarMappingQueryDto,
  UpsertFinanceCategoryJarMappingDto,
} from '../dto/finance-category-jar-mapping.dto';
import { FundAllocationQueryDto } from '../dto/fund-allocation-query.dto';
import {
  FUND_ALLOCATION_RESPONSE_EXAMPLE,
  FundAllocationApiResponseDto,
  FundAllocationBadRequestResponseDto,
  FundAllocationConflictResponseDto,
  FundAllocationListApiResponseDto,
  FundAllocationNotFoundResponseDto,
} from '../dto/fund-allocation-response.dto';
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
    description:
      'Chỉ FAMILY_MANAGER hoặc DEPUTY_MEMBER đã xác thực tài khoản mới được kích hoạt mô hình tài chính. FAMILY_MEMBER hoặc tài khoản chưa verified nhận 403.',
  })
  @ApiUnauthorizedResponse({
    description: 'Thiếu token, token không hợp lệ hoặc token đã hết hạn.',
  })
  activateFinanceModel(
    @Param('familyId') familyId: string,
    @Param('modelId') modelId: string,
  ) {
    return this.financeService.activateFinanceModel(familyId, modelId);
  }

  @Get('fund-allocations')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Lấy lịch sử chia quỹ thành công')
  @ApiOperation({
    summary: 'Xem lại lịch sử chia quỹ theo mô hình và kỳ',
    description:
      'Trả danh sách các lần chia quỹ đã được ghi nhận từ ledger entries có sourceType MODEL_FUND_ALLOCATION. Có thể lọc theo modelId, hoặc lọc chi tiết một kỳ bằng periodMonth + periodYear. Nếu truyền modelId cùng periodMonth + periodYear, API trả đúng lần chia quỹ của mô hình đó trong kỳ đó. Kết quả được group theo sourceId = modelId:YYYY-MM để FE xem lại tháng trước, sau khi mở lại ứng dụng hoặc trên thiết bị khác. Với dữ liệu tạo sau migration metadata, lịch sử dùng snapshot tên hũ, mã hũ, tỷ lệ, tên mô hình và số tiền tại thời điểm chia quỹ; việc đổi tên hũ, đổi tỷ lệ hoặc kích hoạt mô hình khác sau đó không làm thay đổi lịch sử cũ.',
  })
  @ApiOkResponse({
    description:
      'Danh sách phân trang các lần chia quỹ. Mỗi item có cùng cấu trúc data của POST /fund-allocations.',
    type: FundAllocationListApiResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Thiếu token, token không hợp lệ hoặc token đã hết hạn.',
  })
  @ApiForbiddenResponse({
    description:
      'Chỉ FAMILY_MANAGER hoặc DEPUTY_MEMBER được xem lịch sử chia quỹ. FAMILY_MEMBER hoặc user không thuộc gia đình nhận 403.',
  })
  @ApiResponse({
    status: 400,
    description:
      'periodMonth và periodYear phải được truyền đồng thời khi lọc theo kỳ chia quỹ',
  })
  listFundAllocations(
    @Param('familyId') familyId: string,
    @Query() query: FundAllocationQueryDto,
  ) {
    return this.financeService.listFundAllocations(familyId, query);
  }

  @Post('fund-allocations')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Chia quỹ theo mô hình tài chính thành công')
  @ApiOperation({
    summary: 'Chia quỹ gia đình theo tỷ lệ các hũ của mô hình tài chính',
    description:
      'Nếu không truyền modelId, hệ thống dùng mô hình ACTIVE của gia đình. Đây là thao tác phân loại nội bộ số tiền hiện có vào các hũ, không tự tạo tiền mới và không làm tăng tổng số dư gia đình. Mỗi hũ được ghi thành một ledger entry ADJUSTMENT có jarId và sourceType MODEL_FUND_ALLOCATION để audit, đồng thời lưu snapshot tên hũ, mã hũ, tỷ lệ, tên mô hình và số tiền tại thời điểm chia quỹ trong metadata. Toàn bộ quá trình chia quỹ chạy trong một database transaction; nếu tạo bất kỳ ledger entry nào thất bại thì rollback toàn bộ, không có trạng thái chỉ một phần hũ được ghi. Các entry này có thể xuất hiện trong lịch sử ledger, nhưng không được tính như thu nhập mới. FE nên dùng data.items để hiển thị kết quả chia quỹ; data.entries trả về để đối soát/audit khi cần.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Mô hình không có hũ hoạt động hoặc tổng tỷ lệ hũ không bằng 100%',
    type: FundAllocationBadRequestResponseDto,
    examples: {
      invalidFinanceModel: {
        summary: 'Mô hình không hợp lệ',
        value: {
          success: false,
          message: 'Mô hình tài chính đang hoạt động chưa có hũ để chia quỹ',
          statusCode: 400,
          code: 'INVALID_FINANCE_MODEL',
        },
      },
      invalidJarPercentage: {
        summary: 'Tổng tỷ lệ hũ không bằng 100%',
        value: {
          success: false,
          message:
            'Tổng tỷ lệ phân bổ của các hũ hoạt động phải bằng 100% để chia quỹ',
          statusCode: 400,
          code: 'INVALID_JAR_PERCENTAGE',
        },
      },
      insufficientAvailableFund: {
        summary: 'Số tiền chia vượt quỹ khả dụng',
        value: {
          success: false,
          message: 'Số tiền chia quỹ vượt quá quỹ khả dụng của kỳ này',
          statusCode: 400,
          code: 'INSUFFICIENT_AVAILABLE_FUND',
          requestedAmount: 100000,
          availableAmount: 50000,
          periodMonth: 12,
          periodYear: 2026,
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description:
      'Da co lan chia quy ACTIVE cho cung familyId + periodMonth + periodYear, bat ke modelId. Doi ACTIVE sang model khac khong thay doi lich su chia quy cu.',
    type: FundAllocationConflictResponseDto,
    example: {
      success: false,
      message: 'Kỳ này đã có lần chia quỹ',
      statusCode: 409,
      code: 'FUND_ALLOCATION_ALREADY_EXISTS',
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Thiếu token, token không hợp lệ hoặc token đã hết hạn.',
  })
  @ApiForbiddenResponse({
    description:
      'Chỉ FAMILY_MANAGER hoặc DEPUTY_MEMBER đã xác thực tài khoản mới được chia quỹ. FAMILY_MEMBER, user không thuộc gia đình hoặc tài khoản chưa verified nhận 403.',
  })
  @ApiNotFoundResponse({
    description:
      'Không tìm thấy mô hình ACTIVE để chia quỹ. Xảy ra khi gia đình không có model ACTIVE, modelId không tồn tại, hoặc modelId không thuộc gia đình hiện tại.',
    type: FundAllocationNotFoundResponseDto,
    examples: {
      noActiveModel: {
        summary: 'Gia đình không có mô hình ACTIVE',
        value: {
          success: false,
          message:
            'Không tìm thấy mô hình tài chính đang hoạt động trong gia đình này',
          statusCode: 404,
          code: 'NO_ACTIVE_FINANCE_MODEL',
        },
      },
      modelIdNotFound: {
        summary: 'modelId không tồn tại',
        value: {
          success: false,
          message:
            'Không tìm thấy mô hình tài chính đang hoạt động trong gia đình này',
          statusCode: 404,
          code: 'INVALID_FINANCE_MODEL',
        },
      },
      modelIdOutsideFamily: {
        summary: 'modelId không thuộc gia đình hiện tại',
        value: {
          success: false,
          message:
            'Không tìm thấy mô hình tài chính đang hoạt động trong gia đình này',
          statusCode: 404,
          code: 'INVALID_FINANCE_MODEL',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description:
      'Envelope chuẩn. data gồm model, period, totalAmount, sourceType, sourceId, items và entries đã tạo. Chia quỹ là phân loại nội bộ, không làm tăng tổng quỹ gia đình. Response chỉ được trả sau khi transaction tạo đủ ledger entries thành công.',
    type: FundAllocationApiResponseDto,
    examples: {
      sample: {
        summary: 'Chia quỹ thành công',
        value: FUND_ALLOCATION_RESPONSE_EXAMPLE,
      },
    },
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

  @Get('category-jar-mappings')
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Lấy mapping danh mục - hũ tài chính thành công')
  @ApiOperation({
    summary:
      'Lấy cấu hình category thuộc hũ nào theo mô hình tài chính active hoặc modelId cụ thể',
  })
  @ApiOkResponse({
    description:
      'Envelope chuan. data.financeModel co the null khi khong truyen financeModelId va family chua co ACTIVE model; data.items la [] khi model chua co mapping.',
    type: CategoryJarMappingListApiResponseDto,
    examples: {
      sample: {
        summary: 'Category to jar mappings',
        value: CATEGORY_JAR_MAPPING_LIST_RESPONSE_EXAMPLE,
      },
    },
  })
  listCategoryJarMappings(
    @Param('familyId') familyId: string,
    @Query() query: FinanceCategoryJarMappingQueryDto,
  ) {
    return this.financeService.listCategoryJarMappings(familyId, query);
  }

  @Post('category-jar-mappings')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Cấu hình mapping danh mục - hũ tài chính thành công')
  @ApiOperation({
    summary:
      'Tạo hoặc cập nhật mapping category -> jar cho một mô hình tài chính',
  })
  @ApiCreatedResponse({
    description:
      'Envelope chuan. Upsert theo unique key (financeModelId, categoryId); categoryId chi tro toi mot jar trong cung financeModelId.',
    type: CategoryJarMappingDetailApiResponseDto,
    examples: {
      sample: {
        summary: 'Upserted category to jar mapping',
        value: CATEGORY_JAR_MAPPING_DETAIL_RESPONSE_EXAMPLE,
      },
    },
  })
  upsertCategoryJarMapping(
    @Param('familyId') familyId: string,
    @Body() dto: UpsertFinanceCategoryJarMappingDto,
  ) {
    return this.financeService.upsertCategoryJarMapping(familyId, dto);
  }

  @Delete('category-jar-mappings/:mappingId')
  @UseGuards(VerifiedGuard)
  @FamilyRoles(...FINANCE_MANAGER_ROLES)
  @ResponseMessage('Xóa mapping danh mục - hũ tài chính thành công')
  @ApiOperation({ summary: 'Xóa mapping category -> jar' })
  @ApiParam({
    name: 'mappingId',
    description: 'ID mapping cần xóa',
    format: 'uuid',
  })
  @ApiOkResponse({
    description:
      'Envelope chuan. data la mapping vua bi xoa de FE co the cap nhat cache/local state.',
    type: CategoryJarMappingDeleteApiResponseDto,
    examples: {
      sample: {
        summary: 'Deleted category to jar mapping',
        value: CATEGORY_JAR_MAPPING_DELETE_RESPONSE_EXAMPLE,
      },
    },
  })
  deleteCategoryJarMapping(
    @Param('familyId') familyId: string,
    @Param('mappingId') mappingId: string,
  ) {
    return this.financeService.deleteCategoryJarMapping(familyId, mappingId);
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
