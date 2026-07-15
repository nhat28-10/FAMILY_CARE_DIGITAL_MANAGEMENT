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
import { Throttle } from '@nestjs/throttler';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VerifiedGuard } from '../auth/guards/verified.guard';
import { CurrentFamilyMember } from '../family-members/decorators/current-family-member.decorator';
import { FamilyRoles } from '../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../family-members/guards/family-permission.guard';
import { ApproveJoinRequestDto } from './dto/approve-join-request.dto';
import { CreateJoinRequestDto } from './dto/create-join-request.dto';
import { ListJoinRequestsQueryDto } from './dto/list-join-requests-query.dto';
import { JoinRequestsService } from './join-requests.service';

@ApiTags('Join Requests')
@Controller()
export class JoinRequestsController {
  constructor(private readonly joinRequestsService: JoinRequestsService) {}

  @Get('invite-codes/:code')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ResponseMessage('Lấy thông tin mã mời thành công')
  @ApiOperation({ summary: 'Preview a family by invite code (public)' })
  @ApiResponse({ status: 404, description: 'Invite code not found' })
  preview(@Param('code') code: string) {
    return this.joinRequestsService.previewByCode(code);
  }

  @Post('invite-codes/:code/join-requests')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Gửi yêu cầu tham gia thành công')
  @ApiOperation({
    summary: 'Request to join a family by invite code (awaits approval)',
  })
  @ApiResponse({ status: 404, description: 'Invite code not found' })
  @ApiResponse({
    status: 409,
    description: 'Already a member or already has a pending request',
  })
  create(
    @Param('code') code: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateJoinRequestDto,
  ) {
    return this.joinRequestsService.create(code, userId, dto);
  }

  @Get('me/join-requests')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ResponseMessage('Lấy danh sách yêu cầu của bạn thành công')
  @ApiOperation({ summary: 'List my join requests (all statuses)' })
  listMine(@CurrentUser('id') userId: string) {
    return this.joinRequestsService.listMine(userId);
  }

  @Post('me/join-requests/:id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Hủy yêu cầu tham gia thành công')
  @ApiOperation({ summary: 'Cancel my pending join request' })
  @ApiResponse({ status: 400, description: 'Request already decided' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  cancel(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.joinRequestsService.cancel(userId, id);
  }

  @Get('families/:familyId/join-requests')
  @UseGuards(JwtAuthGuard, FamilyPermissionGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @ApiBearerAuth()
  @ResponseMessage('Lấy danh sách yêu cầu tham gia thành công')
  @ApiOperation({
    summary: 'List join requests of a family (FAMILY_MANAGER only)',
  })
  @ApiResponse({ status: 403, description: 'Requires family MANAGER role' })
  listByFamily(
    @Param('familyId') familyId: string,
    @Query() query: ListJoinRequestsQueryDto,
  ) {
    return this.joinRequestsService.listByFamily(familyId, query.status);
  }

  @Post('families/:familyId/join-requests/:id/approve')
  @UseGuards(JwtAuthGuard, FamilyPermissionGuard, VerifiedGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Duyệt yêu cầu tham gia thành công')
  @ApiOperation({
    summary: 'Approve a join request → creates the member (MANAGER only)',
  })
  @ApiResponse({ status: 400, description: 'Request is not PENDING' })
  @ApiResponse({ status: 403, description: 'Requires family MANAGER role' })
  approve(
    @Param('familyId') familyId: string,
    @Param('id') id: string,
    @CurrentFamilyMember('id') approverMemberId: string,
    @Body() dto: ApproveJoinRequestDto,
  ) {
    return this.joinRequestsService.approve(
      familyId,
      approverMemberId,
      id,
      dto,
    );
  }

  @Post('families/:familyId/join-requests/:id/reject')
  @UseGuards(JwtAuthGuard, FamilyPermissionGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Từ chối yêu cầu tham gia thành công')
  @ApiOperation({ summary: 'Reject a join request (MANAGER only)' })
  @ApiResponse({ status: 400, description: 'Request is not PENDING' })
  @ApiResponse({ status: 403, description: 'Requires family MANAGER role' })
  reject(
    @Param('familyId') familyId: string,
    @Param('id') id: string,
    @CurrentFamilyMember('id') deciderMemberId: string,
  ) {
    return this.joinRequestsService.reject(familyId, deciderMemberId, id);
  }
}
