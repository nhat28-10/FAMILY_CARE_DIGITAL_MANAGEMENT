import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserType } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { isDynamicResponse } from '../../../common/types/dynamic-response';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import type { SafeUser } from '../../users/users.types';
import { AdminAuditLogsService } from '../admin-audit-logs.service';
import { AdminBackupRestoreService } from '../admin-backup-restore.service';
import {
  BACKUP_STATUSES,
  BACKUP_TARGETS,
  ConfirmRestoreDto,
  CreateBackupDto,
  CreateRestoreDto,
  ListBackupsQueryDto,
  ListRestoresQueryDto,
  RESTORE_STATUSES,
} from '../dto/backup-restore.dto';

@ApiTags('Admin - Backup & Restore')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.SYSTEM_ADMIN)
@Controller('admin')
export class AdminBackupRestoreController {
  constructor(
    private readonly backupRestore: AdminBackupRestoreService,
    private readonly auditLogs: AdminAuditLogsService,
  ) {}

  @Post('backups')
  @ResponseMessage('Tạo backup thành công.')
  @ApiOperation({ summary: 'Create a controlled backup job' })
  @ApiBody({ type: CreateBackupDto })
  @ApiResponse({ status: 400, description: 'Invalid backup request' })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  async createBackup(
    @CurrentUser() adminUser: SafeUser,
    @Req() request: Request,
    @Body() dto: CreateBackupDto,
  ) {
    try {
      const response = await this.backupRestore.createBackup(adminUser.id, dto);
      const data = isDynamicResponse(response) ? response.data : response;
      await this.auditLogs.record({
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.fullName,
        action: 'ADMIN_BACKUP_CREATE',
        targetType: 'BACKUP',
        targetId: data.backupId,
        result: data.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
        ...this.auditLogs.requestContext(request),
        metadata: {
          target: dto.target,
          status: data.status,
          fileName: data.fileName,
          fileSizeBytes: data.fileSizeBytes,
        },
        errorMessage: data.errorMessage,
      });
      return response;
    } catch (error) {
      await this.auditLogs.record({
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.fullName,
        action: 'ADMIN_BACKUP_CREATE',
        targetType: 'BACKUP',
        targetId: null,
        result: 'FAILED',
        ...this.auditLogs.requestContext(request),
        metadata: dto,
        errorMessage: this.auditLogs.errorMessage(error),
      });
      throw error;
    }
  }

  @Get('backups')
  @ResponseMessage('Lấy danh sách backup thành công.')
  @ApiOperation({ summary: 'List backup jobs' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: BACKUP_STATUSES })
  @ApiQuery({ name: 'target', required: false, enum: BACKUP_TARGETS })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  listBackups(@Query() query: ListBackupsQueryDto) {
    return this.backupRestore.listBackups(query);
  }

  @Get('backups/:backupId')
  @ResponseMessage('Lấy chi tiết backup thành công.')
  @ApiOperation({ summary: 'Get backup job detail' })
  @ApiParam({ name: 'backupId', description: 'Backup job UUID' })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  @ApiResponse({ status: 404, description: 'Backup not found' })
  getBackup(@Param('backupId') backupId: string) {
    return this.backupRestore.getBackup(backupId);
  }

  @Post('restores')
  @ResponseMessage(
    'Tạo yêu cầu restore thành công. Hệ thống chưa thực hiện ghi đè dữ liệu.',
  )
  @ApiOperation({ summary: 'Create a controlled restore request' })
  @ApiBody({ type: CreateRestoreDto })
  @ApiResponse({ status: 400, description: 'Invalid restore request' })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  @ApiResponse({ status: 404, description: 'Backup not found' })
  async createRestore(
    @CurrentUser() adminUser: SafeUser,
    @Req() request: Request,
    @Body() dto: CreateRestoreDto,
  ) {
    try {
      const result = await this.backupRestore.createRestore(adminUser.id, dto);
      await this.auditLogs.record({
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.fullName,
        action: 'ADMIN_RESTORE_REQUEST_CREATE',
        targetType: 'RESTORE',
        targetId: result.restoreId,
        result: 'SUCCESS',
        ...this.auditLogs.requestContext(request),
        metadata: {
          backupId: dto.backupId,
          target: dto.target,
          status: result.status,
        },
      });
      return result;
    } catch (error) {
      await this.auditLogs.record({
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.fullName,
        action: 'ADMIN_RESTORE_REQUEST_CREATE',
        targetType: 'RESTORE',
        targetId: dto.backupId,
        result: 'FAILED',
        ...this.auditLogs.requestContext(request),
        metadata: dto,
        errorMessage: this.auditLogs.errorMessage(error),
      });
      throw error;
    }
  }

  @Get('restores')
  @ResponseMessage('Lấy danh sách yêu cầu restore thành công.')
  @ApiOperation({ summary: 'List restore requests' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: RESTORE_STATUSES })
  @ApiQuery({ name: 'target', required: false, enum: BACKUP_TARGETS })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  listRestores(@Query() query: ListRestoresQueryDto) {
    return this.backupRestore.listRestores(query);
  }

  @Get('restores/:restoreId')
  @ResponseMessage('Lấy chi tiết yêu cầu restore thành công.')
  @ApiOperation({ summary: 'Get restore request detail' })
  @ApiParam({ name: 'restoreId', description: 'Restore request UUID' })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  @ApiResponse({ status: 404, description: 'Restore request not found' })
  getRestore(@Param('restoreId') restoreId: string) {
    return this.backupRestore.getRestore(restoreId);
  }

  @Post('restores/:restoreId/confirm')
  @ResponseMessage(
    'Xác nhận yêu cầu restore thành công. Restore cần được thực hiện theo quy trình vận hành an toàn.',
  )
  @ApiOperation({
    summary: 'Confirm a restore request without running restore',
  })
  @ApiParam({ name: 'restoreId', description: 'Restore request UUID' })
  @ApiBody({ type: ConfirmRestoreDto })
  @ApiResponse({ status: 400, description: 'Invalid restore confirmation' })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  @ApiResponse({ status: 404, description: 'Restore request not found' })
  async confirmRestore(
    @Param('restoreId') restoreId: string,
    @CurrentUser() adminUser: SafeUser,
    @Req() request: Request,
    @Body() dto: ConfirmRestoreDto,
  ) {
    try {
      const result = await this.backupRestore.confirmRestore(
        restoreId,
        adminUser.id,
        dto,
      );
      await this.auditLogs.record({
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.fullName,
        action: 'ADMIN_RESTORE_CONFIRM',
        targetType: 'RESTORE',
        targetId: restoreId,
        result: 'SUCCESS',
        ...this.auditLogs.requestContext(request),
        metadata: {
          confirmationText: dto.confirmationText,
          status: result.status,
        },
      });
      return result;
    } catch (error) {
      await this.auditLogs.record({
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.fullName,
        action: 'ADMIN_RESTORE_CONFIRM',
        targetType: 'RESTORE',
        targetId: restoreId,
        result: 'FAILED',
        ...this.auditLogs.requestContext(request),
        metadata: dto,
        errorMessage: this.auditLogs.errorMessage(error),
      });
      throw error;
    }
  }
}
