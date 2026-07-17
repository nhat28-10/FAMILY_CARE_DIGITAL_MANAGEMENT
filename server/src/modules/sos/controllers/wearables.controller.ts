import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { FamilyMember } from '@prisma/client';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentFamilyMember } from '../../family-members/decorators/current-family-member.decorator';
import { FamilyPermissionGuard } from '../../family-members/guards/family-permission.guard';
import { CreateSensorEventDto } from '../dto/create-sensor-event.dto';
import { PairWearableDto } from '../dto/pair-wearable.dto';
import { UpdateWearableDto } from '../dto/update-wearable.dto';
import { WearablesService } from '../services/wearables.service';

@ApiTags('Wearables')
@ApiBearerAuth()
@ApiParam({ name: 'familyId', description: 'ID của gia đình', format: 'uuid' })
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/wearables')
export class WearablesController {
  constructor(private readonly wearablesService: WearablesService) {}

  @Get()
  @ResponseMessage('Lấy danh sách thiết bị thành công')
  @ApiOperation({ summary: 'Thiết bị đeo/giả lập của gia đình' })
  list(@Param('familyId') familyId: string) {
    return this.wearablesService.list(familyId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Đã ghép nối thiết bị')
  @ApiOperation({
    summary:
      'Ghép nối thiết bị cho chính mình (kèm ownerMemberId = ghép hộ, chỉ quản lý)',
  })
  pair(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember() member: FamilyMember,
    @Body() dto: PairWearableDto,
  ) {
    return this.wearablesService.pair(familyId, member, dto);
  }

  @Patch(':deviceId')
  @ResponseMessage('Đã cập nhật thiết bị')
  @ApiOperation({
    summary: 'Cập nhật/gỡ ghép nối thiết bị (chủ thiết bị hoặc quản lý)',
  })
  update(
    @Param('familyId') familyId: string,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @CurrentFamilyMember() member: FamilyMember,
    @Body() dto: UpdateWearableDto,
  ) {
    return this.wearablesService.update(familyId, deviceId, member, dto);
  }

  @Delete(':deviceId')
  @ResponseMessage('Đã xóa thiết bị')
  @ApiOperation({ summary: 'Xóa thiết bị (chủ thiết bị hoặc quản lý)' })
  remove(
    @Param('familyId') familyId: string,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @CurrentFamilyMember() member: FamilyMember,
  ) {
    return this.wearablesService.remove(familyId, deviceId, member);
  }

  @Post(':deviceId/events')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Đã ghi nhận sự kiện cảm biến')
  @ApiOperation({
    summary:
      'Nhận sự kiện cảm biến (chỉ chủ thiết bị) — SOS_BUTTON_PRESSED/FALL_DETECTED có thể tự tạo cảnh báo',
  })
  ingestEvent(
    @Param('familyId') familyId: string,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @CurrentFamilyMember() member: FamilyMember,
    @Body() dto: CreateSensorEventDto,
  ) {
    return this.wearablesService.ingestEvent(familyId, deviceId, member, dto);
  }

  @Get(':deviceId/events')
  @ResponseMessage('Lấy lịch sử sự kiện cảm biến thành công')
  @ApiOperation({ summary: '50 sự kiện cảm biến gần nhất của thiết bị' })
  listEvents(
    @Param('familyId') familyId: string,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
  ) {
    return this.wearablesService.listEvents(familyId, deviceId);
  }
}
