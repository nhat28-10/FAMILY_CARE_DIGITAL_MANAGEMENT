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
import { FamilyRoles } from '../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../family-members/guards/family-permission.guard';
import { CreateFamilyDto } from './dto/create-family.dto';
import { UpdateFamilyDto } from './dto/update-family.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { UpdateMemberRelationshipDto } from './dto/update-member-relationship.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { FamiliesService } from './families.service';

@ApiTags('Families')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('families')
export class FamiliesController {
  constructor(private readonly familiesService: FamiliesService) {}

  @Post()
  @UseGuards(VerifiedGuard)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo gia đình thành công')
  @ApiOperation({ summary: 'Create a family (creator becomes MANAGER)' })
  @ApiResponse({ status: 201, description: 'Family created' })
  @ApiResponse({ status: 403, description: 'Account not verified' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateFamilyDto) {
    return this.familiesService.create(userId, dto);
  }

  @Get('my')
  @ResponseMessage('Lấy danh sách gia đình thành công')
  @ApiOperation({ summary: 'List families the current user belongs to' })
  myFamilies(@CurrentUser('id') userId: string) {
    return this.familiesService.findMyFamilies(userId);
  }

  @Get(':familyId')
  @UseGuards(FamilyPermissionGuard)
  @ResponseMessage('Lấy thông tin gia đình thành công')
  @ApiOperation({ summary: 'Get a family (members only)' })
  @ApiResponse({ status: 403, description: 'Not a member of this family' })
  getOne(@Param('familyId') familyId: string) {
    return this.familiesService.getById(familyId);
  }

  @Get(':familyId/invite-code')
  @UseGuards(FamilyPermissionGuard)
  @ResponseMessage('Lấy mã mời thành công')
  @ApiOperation({ summary: 'Get the family invite code (any active member)' })
  @ApiResponse({ status: 403, description: 'Not a member of this family' })
  getInviteCode(@Param('familyId') familyId: string) {
    return this.familiesService.getInviteCode(familyId);
  }

  @Post(':familyId/invite-code/regenerate')
  @UseGuards(FamilyPermissionGuard, VerifiedGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Tạo mã mời thành công')
  @ApiOperation({
    summary: 'Create or rotate the family invite code (FAMILY_MANAGER only)',
  })
  @ApiResponse({ status: 403, description: 'Requires family MANAGER role' })
  regenerateInviteCode(@Param('familyId') familyId: string) {
    return this.familiesService.regenerateInviteCode(familyId);
  }

  @Patch(':familyId')
  @UseGuards(FamilyPermissionGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @ResponseMessage('Cập nhật gia đình thành công')
  @ApiOperation({ summary: 'Update a family (family MANAGER only)' })
  @ApiResponse({ status: 403, description: 'Requires family MANAGER role' })
  update(@Param('familyId') familyId: string, @Body() dto: UpdateFamilyDto) {
    return this.familiesService.update(familyId, dto);
  }

  @Patch(':familyId/members/:userId/role')
  @UseGuards(FamilyPermissionGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @ResponseMessage('Cập nhật vai trò thành viên thành công')
  @ApiOperation({
    summary: 'Bổ nhiệm/gỡ phó nhóm (FAMILY_MANAGER only)',
  })
  @ApiResponse({
    status: 400,
    description: 'Vượt giới hạn phó nhóm hoặc đổi vai trò quản lý',
  })
  @ApiResponse({ status: 403, description: 'Requires family MANAGER role' })
  @ApiResponse({ status: 404, description: 'Member not found in this family' })
  changeMemberRole(
    @Param('familyId') familyId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.familiesService.changeMemberRole(
      familyId,
      userId,
      dto.familyRole,
    );
  }

  @Patch(':familyId/members/:userId/relationship')
  @UseGuards(FamilyPermissionGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @ResponseMessage('Cập nhật quan hệ thành viên thành công')
  @ApiOperation({
    summary: 'Cập nhật quan hệ thành viên (FAMILY_MANAGER only)',
  })
  @ApiResponse({ status: 400, description: 'relationship không hợp lệ' })
  @ApiResponse({ status: 403, description: 'Requires family MANAGER role' })
  @ApiResponse({ status: 404, description: 'Member not found in this family' })
  @ApiResponse({
    status: 409,
    description: 'Family already has an active FATHER or MOTHER',
  })
  changeMemberRelationship(
    @Param('familyId') familyId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRelationshipDto,
  ) {
    return this.familiesService.changeMemberRelationship(
      familyId,
      userId,
      dto.relationship,
    );
  }

  @Post(':familyId/transfer-ownership')
  @UseGuards(FamilyPermissionGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Trao quyền trưởng nhóm thành công')
  @ApiOperation({
    summary: 'Trao quyền trưởng nhóm cho thành viên khác (FAMILY_MANAGER only)',
  })
  @ApiResponse({
    status: 400,
    description: 'Trao cho chính mình hoặc thiếu xác nhận',
  })
  @ApiResponse({ status: 403, description: 'Requires family MANAGER role' })
  @ApiResponse({ status: 404, description: 'Member not found in this family' })
  transferOwnership(
    @Param('familyId') familyId: string,
    @CurrentUser('id') currentUserId: string,
    @Body() dto: TransferOwnershipDto,
  ) {
    return this.familiesService.transferOwnership(
      familyId,
      currentUserId,
      dto.targetUserId,
    );
  }

  @Delete(':familyId/members/:userId')
  @UseGuards(FamilyPermissionGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @ResponseMessage('Xóa thành viên thành công')
  @ApiOperation({ summary: 'Remove a member from the family (MANAGER only)' })
  @ApiResponse({ status: 400, description: 'Cannot remove a family manager' })
  @ApiResponse({ status: 404, description: 'Member not found in this family' })
  removeMember(
    @Param('familyId') familyId: string,
    @Param('userId') userId: string,
  ) {
    return this.familiesService.removeMember(familyId, userId);
  }
}
