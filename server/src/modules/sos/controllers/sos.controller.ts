import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FamilyRole } from '@prisma/client';
import {
  ApiCreatedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentFamilyMember } from '../../family-members/decorators/current-family-member.decorator';
import { FamilyRoles } from '../../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../../family-members/guards/family-permission.guard';
import { CreateSosAlertDto } from '../dto/create-sos-alert.dto';
import { CreateSosResponseDto } from '../dto/create-sos-response.dto';
import { ListSosAlertQueryDto } from '../dto/list-sos-alert-query.dto';
import { PushSosLocationBatchDto } from '../dto/push-sos-location-batch.dto';
import { PushSosLocationDto } from '../dto/push-sos-location.dto';
import { ResolveSosAlertDto } from '../dto/resolve-sos-alert.dto';
import {
  SosAlertApiResponseDto,
  SosAlertListApiResponseDto,
} from '../dto/sos-alert-response.dto';
import { SosService } from '../services/sos.service';

const MANAGER_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
] as const;

@ApiTags('SOS')
@ApiBearerAuth()
@ApiParam({ name: 'familyId', description: 'ID của gia đình', format: 'uuid' })
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/sos')
export class SosController {
  constructor(private readonly sosService: SosService) {}

  @Post('alerts')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Đã kích hoạt cảnh báo SOS')
  @ApiOperation({ summary: 'Kích hoạt cảnh báo SOS (mọi thành viên)' })
  @ApiCreatedResponse({
    description: 'Cảnh báo SOS vừa được tạo, data dùng sosAlertId làm ID chuẩn',
    type: SosAlertApiResponseDto,
  })
  trigger(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateSosAlertDto,
  ) {
    return this.sosService.trigger(familyId, memberId, dto);
  }

  @Get('alerts')
  @ResponseMessage('Lấy danh sách cảnh báo SOS thành công')
  @ApiOperation({ summary: 'Lịch sử cảnh báo SOS của gia đình' })
  @ApiOkResponse({
    description:
      'Danh sách cảnh báo SOS, mỗi item dùng sosAlertId làm ID chuẩn',
    type: SosAlertListApiResponseDto,
  })
  list(
    @Param('familyId') familyId: string,
    @Query() query: ListSosAlertQueryDto,
  ) {
    return this.sosService.listAlerts(familyId, query);
  }

  @Get('alerts/:alertId')
  @ResponseMessage('Lấy chi tiết cảnh báo SOS thành công')
  @ApiOperation({
    summary: 'Chi tiết một cảnh báo SOS (kèm phản hồi + vị trí)',
  })
  @ApiOkResponse({
    description: 'Chi tiết cảnh báo SOS, data dùng sosAlertId làm ID chuẩn',
    type: SosAlertApiResponseDto,
  })
  getOne(
    @Param('familyId') familyId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
  ) {
    return this.sosService.getAlert(familyId, alertId);
  }

  @Post('alerts/:alertId/locations')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Đã ghi nhận vị trí')
  @ApiOperation({
    summary: 'Gửi 1 điểm vị trí cho cảnh báo đang active (chỉ người kích hoạt)',
  })
  pushLocation(
    @Param('familyId') familyId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: PushSosLocationDto,
  ) {
    return this.sosService.pushLocation(familyId, alertId, memberId, dto);
  }

  @Post('alerts/:alertId/locations/batch')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Đã ghi nhận các điểm vị trí')
  @ApiOperation({
    summary: 'Gửi nhiều điểm vị trí theo lô (buffer offline flush)',
  })
  pushLocationBatch(
    @Param('familyId') familyId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: PushSosLocationBatchDto,
  ) {
    return this.sosService.pushLocationBatch(familyId, alertId, memberId, dto);
  }

  @Get('alerts/:alertId/location/current')
  @ResponseMessage('Lấy vị trí hiện tại thành công')
  @ApiOperation({
    summary: 'Vị trí mới nhất của cảnh báo (cho người theo dõi vừa vào)',
  })
  getCurrentLocation(
    @Param('familyId') familyId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
  ) {
    return this.sosService.getCurrentLocation(familyId, alertId);
  }

  @Post('alerts/:alertId/responses')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Đã gửi phản hồi')
  @ApiOperation({
    summary: 'Phản hồi cảnh báo SOS (VIEWED / CONFIRM_SAFE / NEED_HELP)',
  })
  respond(
    @Param('familyId') familyId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateSosResponseDto,
  ) {
    return this.sosService.respond(familyId, alertId, memberId, dto);
  }

  @Post('alerts/:alertId/confirm-safety')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Đã xác nhận an toàn')
  @ApiOperation({ summary: 'Người kích hoạt xác nhận an toàn' })
  confirmSafety(
    @Param('familyId') familyId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @CurrentFamilyMember('id') memberId: string,
  ) {
    return this.sosService.confirmSafety(familyId, alertId, memberId);
  }

  @Patch('alerts/:alertId/resolve')
  @FamilyRoles(...MANAGER_ROLES)
  @ResponseMessage('Đã xử lý cảnh báo SOS')
  @ApiOperation({
    summary: 'Resolve cảnh báo SOS (FAMILY_MANAGER / DEPUTY_MEMBER)',
  })
  @ApiOkResponse({
    description:
      'Cảnh báo SOS sau khi resolve, data dùng sosAlertId làm ID chuẩn',
    type: SosAlertApiResponseDto,
  })
  resolve(
    @Param('familyId') familyId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: ResolveSosAlertDto,
  ) {
    return this.sosService.resolve(familyId, alertId, memberId, dto);
  }

  @Patch('alerts/:alertId/cancel')
  @FamilyRoles(...MANAGER_ROLES)
  @ResponseMessage('Đã hủy cảnh báo SOS')
  @ApiOperation({
    summary: 'Hủy cảnh báo SOS (FAMILY_MANAGER / DEPUTY_MEMBER)',
  })
  @ApiOkResponse({
    description: 'Cảnh báo SOS sau khi hủy, data dùng sosAlertId làm ID chuẩn',
    type: SosAlertApiResponseDto,
  })
  cancel(
    @Param('familyId') familyId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: ResolveSosAlertDto,
  ) {
    return this.sosService.cancel(familyId, alertId, memberId, dto);
  }
}
