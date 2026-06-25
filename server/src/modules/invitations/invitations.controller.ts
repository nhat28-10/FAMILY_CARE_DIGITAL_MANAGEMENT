import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
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
import { VerifiedGuard } from '../auth/guards/verified.guard';
import { CurrentFamilyMember } from '../family-members/decorators/current-family-member.decorator';
import { FamilyRoles } from '../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../family-members/guards/family-permission.guard';
import type { SafeUser } from '../users/users.types';
import { ApproveInvitationDto } from './dto/approve-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { ListInvitationsQueryDto } from './dto/list-invitations-query.dto';
import { InvitationsService } from './invitations.service';

@ApiTags('Invitations')
@Controller()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) { }

  @Post('families/:familyId/invitations')
  @UseGuards(JwtAuthGuard, FamilyPermissionGuard, VerifiedGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo lời mời thành công')
  @ApiOperation({ summary: 'Invite a member to a family (FAMILY_MANAGER only)' })
  @ApiResponse({ status: 201, description: 'Invitation created (token returned once)' })
  @ApiResponse({ status: 403, description: 'Requires family FAMILY_MANAGER role' })
  create(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitationsService.create(familyId, memberId, dto);
  }

  @Get('invitations/:token')
  @ResponseMessage('Lấy thông tin lời mời thành công')
  @ApiOperation({ summary: 'Look up an invitation by token (public)' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  getByToken(@Param('token') token: string) {
    return this.invitationsService.getByToken(token);
  }

  @Post('invitations/:token/claim')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Gửi yêu cầu tham gia thành công')
  @ApiOperation({
    summary: 'Send a join request for an invitation (awaits manager approval)',
  })
  @ApiResponse({
    status: 400,
    description: 'Invitation expired or not pending',
  })
  @ApiResponse({
    status: 403,
    description: 'Invitation sent to a different email',
  })
  @ApiResponse({ status: 409, description: 'Already a member of this family' })
  claim(@Param('token') token: string, @CurrentUser() user: SafeUser) {
    return this.invitationsService.claim(token, user);
  }

  @Post('invitations/:token/reject')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Từ chối lời mời thành công')
  @ApiOperation({ summary: 'Decline an invitation sent to me' })
  @ApiResponse({
    status: 400,
    description: 'Invitation expired or not pending',
  })
  reject(@Param('token') token: string, @CurrentUser() user: SafeUser) {
    return this.invitationsService.reject(token, user);
  }

  @Get('families/:familyId/invitations')
  @UseGuards(JwtAuthGuard, FamilyPermissionGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @ApiBearerAuth()
  @ResponseMessage('Lấy danh sách lời mời thành công')
  @ApiOperation({
    summary: 'List a family invitations (FAMILY_MANAGER only)',
  })
  @ApiResponse({ status: 403, description: 'Requires family FAMILY_MANAGER role' })
  list(
    @Param('familyId') familyId: string,
    @Query() query: ListInvitationsQueryDto,
  ) {
    return this.invitationsService.listByFamily(familyId, query.status);
  }

  @Post('families/:familyId/invitations/:id/approve')
  @UseGuards(JwtAuthGuard, FamilyPermissionGuard, VerifiedGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Duyệt yêu cầu tham gia thành công')
  @ApiOperation({
    summary: 'Approve a join request → creates the member (FAMILY_MANAGER only)',
  })
  @ApiResponse({ status: 400, description: 'Invitation is not in CLAIMED state' })
  @ApiResponse({ status: 403, description: 'Requires family FAMILY_MANAGER role' })
  approve(
    @Param('familyId') familyId: string,
    @Param('id') id: string,
    @CurrentFamilyMember('id') approverMemberId: string,
    @Body() dto: ApproveInvitationDto,
  ) {
    return this.invitationsService.approve(familyId, approverMemberId, id, dto);
  }

  @Post('families/:familyId/invitations/:id/reject')
  @UseGuards(JwtAuthGuard, FamilyPermissionGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Từ chối yêu cầu tham gia thành công')
  @ApiOperation({
    summary: 'Reject a join request (FAMILY_MANAGER only)',
  })
  @ApiResponse({ status: 400, description: 'Invitation is not in CLAIMED state' })
  @ApiResponse({ status: 403, description: 'Requires family FAMILY_MANAGER role' })
  rejectClaim(@Param('familyId') familyId: string, @Param('id') id: string) {
    return this.invitationsService.rejectClaim(familyId, id);
  }
}
