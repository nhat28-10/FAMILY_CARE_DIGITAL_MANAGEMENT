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
  Req,
  UseGuards,
} from '@nestjs/common';
import { AccountStatus, UserType } from '@prisma/client';
import {
  ApiBody,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import type { SafeUser } from '../../users/users.types';
import { AdminAuditLogsService } from '../admin-audit-logs.service';
import { AdminService } from '../admin.service';
import type { AdminAuditAction } from '../dto/list-admin-audit-logs-query.dto';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { AdminUpdateUserDto } from '../dto/update-user.dto';

@ApiTags('Admin - Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.SYSTEM_ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly admin: AdminService,
    private readonly auditLogs: AdminAuditLogsService,
  ) {}

  @Get()
  @ResponseMessage('Lấy danh sách người dùng thành công')
  @ApiOperation({ summary: 'List users (paginated, SYSTEM_ADMIN only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'userType', required: false, enum: UserType })
  @ApiQuery({ name: 'accountStatus', required: false, enum: AccountStatus })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  list(@Query() query: ListUsersQueryDto) {
    return this.admin.listUsers(query);
  }

  @Get(':id')
  @ResponseMessage('Lấy thông tin người dùng thành công')
  @ApiOperation({ summary: 'Get a user by id' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 404, description: 'User not found' })
  get(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Patch(':id')
  @ResponseMessage('Cập nhật người dùng thành công')
  @ApiOperation({ summary: 'Update a user (status/type/profile)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiBody({ type: AdminUpdateUserDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @Param('id') id: string,
    @CurrentUser() adminUser: SafeUser,
    @Req() request: Request,
    @Body() dto: AdminUpdateUserDto,
  ) {
    const action = this.auditActionForUpdate(dto);
    try {
      const result = await this.admin.updateUser(id, dto, adminUser.id);
      await this.auditLogs.record({
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.fullName,
        action,
        targetType: 'USER',
        targetId: id,
        result: 'SUCCESS',
        ...this.auditLogs.requestContext(request),
        metadata: {
          accountStatus: dto.accountStatus,
          changedFields: Object.keys(dto),
        },
      });
      return result;
    } catch (error) {
      await this.auditLogs.record({
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.fullName,
        action,
        targetType: 'USER',
        targetId: id,
        result: 'FAILED',
        ...this.auditLogs.requestContext(request),
        metadata: {
          accountStatus: dto.accountStatus,
          changedFields: Object.keys(dto),
        },
        errorMessage: this.auditLogs.errorMessage(error),
      });
      throw error;
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Xóa người dùng thành công')
  @ApiOperation({ summary: 'Delete a user' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() adminUser: SafeUser,
    @Req() request: Request,
  ) {
    try {
      const result = await this.admin.deleteUser(id, adminUser.id);
      await this.auditLogs.record({
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.fullName,
        action: 'ADMIN_USER_DELETE',
        targetType: 'USER',
        targetId: id,
        result: 'SUCCESS',
        ...this.auditLogs.requestContext(request),
      });
      return result;
    } catch (error) {
      await this.auditLogs.record({
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.fullName,
        action: 'ADMIN_USER_DELETE',
        targetType: 'USER',
        targetId: id,
        result: 'FAILED',
        ...this.auditLogs.requestContext(request),
        errorMessage: this.auditLogs.errorMessage(error),
      });
      throw error;
    }
  }

  private auditActionForUpdate(dto: AdminUpdateUserDto): AdminAuditAction {
    const statusAction = this.auditActionForAccountStatus(dto.accountStatus);
    return statusAction ?? 'ADMIN_USER_UPDATE';
  }

  private auditActionForAccountStatus(
    accountStatus?: AccountStatus,
  ): AdminAuditAction | null {
    if (accountStatus === AccountStatus.ACTIVE) return 'ADMIN_USER_UNLOCK';
    if (
      accountStatus === AccountStatus.SUSPENDED ||
      accountStatus === AccountStatus.INACTIVE
    ) {
      return 'ADMIN_USER_LOCK';
    }
    return null;
  }
}
