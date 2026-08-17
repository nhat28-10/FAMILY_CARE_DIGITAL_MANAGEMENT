import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { FamilyRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentFamilyMember } from '../../family-members/decorators/current-family-member.decorator';
import { FamilyRoles } from '../../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../../family-members/guards/family-permission.guard';
import { UpdateSosSettingsDto } from '../dto/update-sos-settings.dto';
import { SosSettingsService } from '../services/sos-settings.service';

const SOS_SETTINGS_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
  FamilyRole.FAMILY_MEMBER,
] as const;

@ApiTags('SOS')
@ApiBearerAuth()
@ApiParam({ name: 'familyId', description: 'ID của gia đình', format: 'uuid' })
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/sos/settings')
export class SosSettingsController {
  constructor(private readonly sosSettingsService: SosSettingsService) {}

  @Get()
  @ResponseMessage('Lấy cài đặt SOS thành công')
  @ApiOperation({
    summary: 'Cài đặt SOS của gia đình (tự tạo mặc định lần đầu)',
  })
  get(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
  ) {
    return this.sosSettingsService.getOrCreate(familyId, memberId);
  }

  @Patch()
  @FamilyRoles(...SOS_SETTINGS_ROLES)
  @ResponseMessage('Đã cập nhật cài đặt SOS')
  @ApiOperation({
    summary:
      'Cập nhật cài đặt SOS (FAMILY_MANAGER / DEPUTY_MEMBER / FAMILY_MEMBER)',
  })
  update(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: UpdateSosSettingsDto,
  ) {
    return this.sosSettingsService.update(familyId, memberId, dto);
  }
}
