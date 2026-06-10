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
import { UserType } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
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
  @ResponseMessage('Fetched invitations successfully')
  @ApiOperation({ summary: 'List invitations (paginated, SYSTEM_ADMIN only)' })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  list(@Query() query: ListInvitationsQueryDto) {
    return this.admin.listInvitations(query);
  }

  @Get(':id')
  @ResponseMessage('Fetched invitation successfully')
  @ApiOperation({ summary: 'Get an invitation by id' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  get(@Param('id') id: string) {
    return this.admin.getInvitation(id);
  }

  @Patch(':id')
  @ResponseMessage('Invitation updated successfully')
  @ApiOperation({ summary: 'Update an invitation status' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  update(@Param('id') id: string, @Body() dto: AdminUpdateInvitationDto) {
    return this.admin.updateInvitation(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Invitation deleted successfully')
  @ApiOperation({ summary: 'Delete an invitation' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  remove(@Param('id') id: string) {
    return this.admin.deleteInvitation(id);
  }
}
