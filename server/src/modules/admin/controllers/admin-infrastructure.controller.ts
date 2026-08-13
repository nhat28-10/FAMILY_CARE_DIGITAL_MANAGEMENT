import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { UserType } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOkResponse,
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
import { AdminInfrastructureService } from '../admin-infrastructure.service';
import { AdminInfrastructureHostResponseDto } from '../dto/admin-response.dto';
import { DockerContainerLogsQueryDto } from '../dto/docker-container-logs-query.dto';

@ApiTags('Admin - Infrastructure')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.SYSTEM_ADMIN)
@Controller('admin/infrastructure')
export class AdminInfrastructureController {
  constructor(
    private readonly infrastructure: AdminInfrastructureService,
    private readonly auditLogs: AdminAuditLogsService,
  ) {}

  @Get('host')
  @ResponseMessage('Lấy thông tin tài nguyên host thành công')
  @ApiOperation({ summary: 'Get host/container runtime resources' })
  @ApiOkResponse({ type: AdminInfrastructureHostResponseDto })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  host() {
    return this.infrastructure.getHost();
  }

  @Get('docker/containers')
  @ResponseMessage('Lấy danh sách Docker containers thành công')
  @ApiOperation({ summary: 'List Docker containers via Docker socket' })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  listContainers() {
    return this.infrastructure.listDockerContainers();
  }

  @Get('docker/containers/:containerId/stats')
  @ResponseMessage('Lấy thống kê Docker container thành công')
  @ApiOperation({ summary: 'Get Docker container stats' })
  @ApiParam({ name: 'containerId', description: 'Docker container id or name' })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  @ApiResponse({ status: 404, description: 'Container not found' })
  async containerStats(
    @Param('containerId') containerId: string,
    @CurrentUser() adminUser: SafeUser,
    @Req() request: Request,
  ) {
    try {
      const result =
        await this.infrastructure.getDockerContainerStats(containerId);
      await this.auditContainerView({
        adminUser,
        request,
        action: 'ADMIN_CONTAINER_STATS_VIEW',
        containerId,
        query: null,
        result,
      });
      return result;
    } catch (error) {
      await this.auditContainerView({
        adminUser,
        request,
        action: 'ADMIN_CONTAINER_STATS_VIEW',
        containerId,
        query: null,
        result: null,
        error,
      });
      throw error;
    }
  }

  @Get('docker/containers/:containerId/logs')
  @ResponseMessage('Đã lấy log container thành công.')
  @ApiOperation({ summary: 'Get recent Docker container logs' })
  @ApiParam({ name: 'containerId', description: 'Docker container id or name' })
  @ApiQuery({
    name: 'tail',
    required: false,
    type: Number,
    example: 100,
    description: 'Number of log lines to return, from 1 to 500',
  })
  @ApiQuery({
    name: 'timestamps',
    required: false,
    type: Boolean,
    example: true,
    description: 'Include Docker timestamps',
  })
  @ApiQuery({
    name: 'stdout',
    required: false,
    type: Boolean,
    example: true,
    description: 'Include stdout logs',
  })
  @ApiQuery({
    name: 'stderr',
    required: false,
    type: Boolean,
    example: true,
    description: 'Include stderr logs',
  })
  @ApiQuery({
    name: 'since',
    required: false,
    type: String,
    description: 'Optional Docker logs since value',
  })
  @ApiQuery({
    name: 'until',
    required: false,
    type: String,
    description: 'Optional Docker logs until value',
  })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  @ApiResponse({ status: 404, description: 'Container not found' })
  async containerLogs(
    @Param('containerId') containerId: string,
    @CurrentUser() adminUser: SafeUser,
    @Req() request: Request,
    @Query() query: DockerContainerLogsQueryDto,
  ) {
    try {
      const result = await this.infrastructure.getDockerContainerLogs(
        containerId,
        query,
      );
      await this.auditContainerView({
        adminUser,
        request,
        action: 'ADMIN_CONTAINER_LOGS_VIEW',
        containerId,
        query,
        result,
      });
      return result;
    } catch (error) {
      await this.auditContainerView({
        adminUser,
        request,
        action: 'ADMIN_CONTAINER_LOGS_VIEW',
        containerId,
        query,
        result: null,
        error,
      });
      throw error;
    }
  }

  private async auditContainerView(input: {
    adminUser: SafeUser;
    request: Request;
    action: 'ADMIN_CONTAINER_STATS_VIEW' | 'ADMIN_CONTAINER_LOGS_VIEW';
    containerId: string;
    query: DockerContainerLogsQueryDto | null;
    result: unknown;
    error?: unknown;
  }) {
    const unavailableMessage = this.dockerUnavailableMessage(input.result);
    await this.auditLogs.record({
      adminUserId: input.adminUser.id,
      adminEmail: input.adminUser.email,
      adminName: input.adminUser.fullName,
      action: input.action,
      targetType: 'CONTAINER',
      targetId: input.containerId,
      result: input.error || unavailableMessage ? 'FAILED' : 'SUCCESS',
      ...this.auditLogs.requestContext(input.request),
      metadata: input.query
        ? {
            tail: input.query.tail,
            timestamps: input.query.timestamps,
            stdout: input.query.stdout,
            stderr: input.query.stderr,
            since: input.query.since,
            until: input.query.until,
          }
        : { containerId: input.containerId },
      errorMessage: input.error
        ? this.auditLogs.errorMessage(input.error)
        : unavailableMessage,
    });
  }

  private dockerUnavailableMessage(result: unknown): string | null {
    if (
      result &&
      typeof result === 'object' &&
      (result as { dockerAvailable?: unknown }).dockerAvailable === false
    ) {
      const message = (result as { message?: unknown }).message;
      return typeof message === 'string'
        ? message
        : 'Docker socket không khả dụng.';
    }
    return null;
  }
}
