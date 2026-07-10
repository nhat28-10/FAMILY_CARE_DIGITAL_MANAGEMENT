import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UserType } from '@prisma/client';
import {
  ApiBearerAuth,
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
import { AdminAuditLogsService } from '../admin-audit-logs.service';
import {
  ADMIN_AUDIT_ACTIONS,
  ADMIN_AUDIT_RESULTS,
  ADMIN_AUDIT_TARGET_TYPES,
  ListAdminAuditLogsQueryDto,
} from '../dto/list-admin-audit-logs-query.dto';

@ApiTags('Admin - Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.SYSTEM_ADMIN)
@Controller('admin/audit-logs')
export class AdminAuditLogsController {
  constructor(private readonly auditLogs: AdminAuditLogsService) {}

  @Get()
  @ResponseMessage('Lấy danh sách audit logs thành công.')
  @ApiOperation({ summary: 'List admin audit logs' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'adminUserId', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, enum: ADMIN_AUDIT_ACTIONS })
  @ApiQuery({
    name: 'targetType',
    required: false,
    enum: ADMIN_AUDIT_TARGET_TYPES,
  })
  @ApiQuery({ name: 'targetId', required: false, type: String })
  @ApiQuery({ name: 'result', required: false, enum: ADMIN_AUDIT_RESULTS })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  list(@Query() query: ListAdminAuditLogsQueryDto) {
    return this.auditLogs.list(query);
  }

  @Get(':auditLogId')
  @ResponseMessage('Lấy chi tiết audit log thành công.')
  @ApiOperation({ summary: 'Get admin audit log detail' })
  @ApiParam({ name: 'auditLogId', description: 'Audit log UUID' })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  @ApiResponse({ status: 404, description: 'Audit log not found' })
  get(@Param('auditLogId') auditLogId: string) {
    return this.auditLogs.get(auditLogId);
  }
}
