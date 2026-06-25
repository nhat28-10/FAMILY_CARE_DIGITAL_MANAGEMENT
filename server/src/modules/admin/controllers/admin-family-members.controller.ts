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
import { ListMembersQueryDto } from '../dto/list-members-query.dto';
import { AdminUpdateMemberDto } from '../dto/update-member.dto';

@ApiTags('Admin - Family Members')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.SYSTEM_ADMIN)
@Controller('admin/family-members')
export class AdminFamilyMembersController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  @ResponseMessage('Lấy danh sách thành viên gia đình thành công')
  @ApiOperation({
    summary: 'List family members (paginated, SYSTEM_ADMIN only)',
  })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  list(@Query() query: ListMembersQueryDto) {
    return this.admin.listMembers(query);
  }

  @Get(':id')
  @ResponseMessage('Lấy thông tin thành viên gia đình thành công')
  @ApiOperation({ summary: 'Get a family member by id' })
  @ApiResponse({ status: 404, description: 'Family member not found' })
  get(@Param('id') id: string) {
    return this.admin.getMember(id);
  }

  @Patch(':id')
  @ResponseMessage('Cập nhật thành viên gia đình thành công')
  @ApiOperation({
    summary: 'Update a family member (role/relationship/status)',
  })
  @ApiResponse({ status: 404, description: 'Family member not found' })
  update(@Param('id') id: string, @Body() dto: AdminUpdateMemberDto) {
    return this.admin.updateMember(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Xóa thành viên gia đình thành công')
  @ApiOperation({ summary: 'Remove a family member' })
  @ApiResponse({ status: 404, description: 'Family member not found' })
  remove(@Param('id') id: string) {
    return this.admin.deleteMember(id);
  }
}
