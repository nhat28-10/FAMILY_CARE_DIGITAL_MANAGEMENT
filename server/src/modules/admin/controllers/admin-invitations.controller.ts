import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InvitationStatus, UserType } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AdminService } from '../admin.service';
import { ListInvitationsQueryDto } from '../dto/list-invitations-query.dto';
import { AdminUpdateInvitationDto } from '../dto/update-invitation.dto';

@ApiTags('Admin - Invitations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.SYSTEM_ADMIN)
@Controller('admin/invitations')
export class AdminInvitationsController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  @ResponseMessage('Lấy danh sách lời mời thành công')
  @ApiOperation({ summary: 'List invitations (paginated, SYSTEM_ADMIN only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: InvitationStatus })
  @ApiQuery({ name: 'familyId', required: false, type: String })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  list(@Query() query: ListInvitationsQueryDto) {
    return this.admin.listInvitations(query);
  }

  @Get(':id')
  @ResponseMessage('Lấy thông tin lời mời thành công')
  @ApiOperation({ summary: 'Get an invitation by id' })
  @ApiParam({ name: 'id', description: 'Invitation UUID' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  get(@Param('id') id: string) {
    return this.admin.getInvitation(id);
  }

  @Patch(':id')
  @ResponseMessage('Cập nhật lời mời thành công')
  @ApiOperation({ summary: 'Update an invitation status' })
  @ApiParam({ name: 'id', description: 'Invitation UUID' })
  @ApiBody({ type: AdminUpdateInvitationDto })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  update(@Param('id') id: string, @Body() dto: AdminUpdateInvitationDto) {
    return this.admin.updateInvitation(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Xóa lời mời thành công')
  @ApiOperation({ summary: 'Delete an invitation' })
  @ApiParam({ name: 'id', description: 'Invitation UUID' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  remove(@Param('id') id: string) {
    return this.admin.deleteInvitation(id);
  }
}
