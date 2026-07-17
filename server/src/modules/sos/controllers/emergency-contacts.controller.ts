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
import { CreateEmergencyContactDto } from '../dto/create-emergency-contact.dto';
import { UpdateEmergencyContactDto } from '../dto/update-emergency-contact.dto';
import { SosSettingsService } from '../services/sos-settings.service';

const MANAGER_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
] as const;

@ApiTags('SOS')
@ApiBearerAuth()
@ApiParam({ name: 'familyId', description: 'ID của gia đình', format: 'uuid' })
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/sos/emergency-contacts')
export class EmergencyContactsController {
  constructor(private readonly sosSettingsService: SosSettingsService) {}

  @Get()
  @ResponseMessage('Lấy danh sách liên hệ khẩn cấp thành công')
  @ApiOperation({ summary: 'Danh bạ khẩn cấp của gia đình (mọi thành viên)' })
  list(@Param('familyId') familyId: string) {
    return this.sosSettingsService.listContacts(familyId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @FamilyRoles(...MANAGER_ROLES)
  @ResponseMessage('Đã thêm liên hệ khẩn cấp')
  @ApiOperation({
    summary: 'Thêm liên hệ khẩn cấp (FAMILY_MANAGER / DEPUTY_MEMBER)',
  })
  add(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateEmergencyContactDto,
  ) {
    return this.sosSettingsService.addContact(familyId, memberId, dto);
  }

  @Patch(':contactId')
  @FamilyRoles(...MANAGER_ROLES)
  @ResponseMessage('Đã cập nhật liên hệ khẩn cấp')
  @ApiOperation({
    summary: 'Sửa liên hệ khẩn cấp (FAMILY_MANAGER / DEPUTY_MEMBER)',
  })
  update(
    @Param('familyId') familyId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: UpdateEmergencyContactDto,
  ) {
    return this.sosSettingsService.updateContact(familyId, contactId, dto);
  }

  @Delete(':contactId')
  @FamilyRoles(...MANAGER_ROLES)
  @ResponseMessage('Đã xóa liên hệ khẩn cấp')
  @ApiOperation({
    summary: 'Xóa liên hệ khẩn cấp (FAMILY_MANAGER / DEPUTY_MEMBER)',
  })
  remove(
    @Param('familyId') familyId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.sosSettingsService.removeContact(familyId, contactId);
  }
}
