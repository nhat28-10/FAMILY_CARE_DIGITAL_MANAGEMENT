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
import { FamilyRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentFamilyMember } from '../family-members/decorators/current-family-member.decorator';
import { FamilyRoles } from '../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../family-members/guards/family-permission.guard';
import type { SafeUser } from '../users/users.types';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationsService } from './invitations.service';

@ApiTags('Invitations')
@Controller()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post('families/:familyId/invitations')
  @UseGuards(JwtAuthGuard, FamilyPermissionGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Invitation created successfully')
  @ApiOperation({
    summary: 'Invite a member to a family (FAMILY_MANAGER only)',
  })
  @ApiResponse({
    status: 201,
    description: 'Invitation created (token returned once)',
  })
  @ApiResponse({
    status: 403,
    description: 'Requires family FAMILY_MANAGER role',
  })
  create(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitationsService.create(familyId, memberId, dto);
  }

  @Get('invitations/:token')
  @ResponseMessage('Fetched invitation successfully')
  @ApiOperation({ summary: 'Look up an invitation by token (public)' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  getByToken(@Param('token') token: string) {
    return this.invitationsService.getByToken(token);
  }

  @Post('invitations/:token/accept')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Invitation accepted successfully')
  @ApiOperation({ summary: 'Accept an invitation (joins the family)' })
  @ApiResponse({
    status: 400,
    description: 'Invitation expired or not pending',
  })
  @ApiResponse({
    status: 403,
    description: 'Invitation sent to a different email',
  })
  @ApiResponse({ status: 409, description: 'Already a member of this family' })
  accept(@Param('token') token: string, @CurrentUser() user: SafeUser) {
    return this.invitationsService.accept(token, user);
  }

  @Post('invitations/:token/reject')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Invitation rejected successfully')
  @ApiOperation({ summary: 'Reject an invitation' })
  @ApiResponse({
    status: 400,
    description: 'Invitation expired or not pending',
  })
  reject(@Param('token') token: string, @CurrentUser() user: SafeUser) {
    return this.invitationsService.reject(token, user);
  }
}
