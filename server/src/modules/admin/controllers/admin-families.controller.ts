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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ProvisioningActionType,
  ProvisioningStatus,
  UserType,
  WorkspaceStatus,
} from '@prisma/client';
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
import { ListFamiliesQueryDto } from '../dto/list-families-query.dto';
import { ListProvisioningLogsQueryDto } from '../dto/list-provisioning-logs-query.dto';
import { ManualRenewSubscriptionDto } from '../dto/manual-renew-subscription.dto';
import { RetryProvisioningDto } from '../dto/retry-provisioning.dto';
import { AdminUpdateFamilyDto } from '../dto/update-family.dto';
import { UpdateSubscriptionStatusDto } from '../dto/update-subscription-status.dto';

@ApiTags('Admin - Families')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.SYSTEM_ADMIN)
@Controller('admin/families')
export class AdminFamiliesController {
  constructor(
    private readonly admin: AdminService,
    private readonly auditLogs: AdminAuditLogsService,
  ) {}

  @Get()
  @ResponseMessage('Lấy danh sách gia đình thành công')
  @ApiOperation({ summary: 'List families (paginated, SYSTEM_ADMIN only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: WorkspaceStatus })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  list(@Query() query: ListFamiliesQueryDto) {
    return this.admin.listFamilies(query);
  }

  @Get(':id')
  @ResponseMessage('Lấy thông tin gia đình thành công')
  @ApiOperation({ summary: 'Get a family by id (with members)' })
  @ApiParam({ name: 'id', description: 'Family UUID' })
  @ApiResponse({ status: 404, description: 'Family not found' })
  get(@Param('id') id: string) {
    return this.admin.getFamily(id);
  }

  @Get(':familyId/subscription')
  @ResponseMessage('Lấy thông tin gói dịch vụ gia đình thành công')
  @ApiOperation({ summary: 'Get a family subscription by family id' })
  @ApiParam({ name: 'familyId', description: 'Family UUID' })
  @ApiResponse({ status: 404, description: 'Family or subscription not found' })
  getSubscription(@Param('familyId') familyId: string) {
    return this.admin.getFamilySubscription(familyId);
  }

  @Get(':familyId/activation-status')
  @ResponseMessage('Lấy trạng thái kích hoạt workspace thành công')
  @ApiOperation({ summary: 'Get family workspace activation status' })
  @ApiParam({ name: 'familyId', description: 'Family UUID' })
  @ApiResponse({ status: 404, description: 'Family workspace not found' })
  getActivationStatus(@Param('familyId') familyId: string) {
    return this.admin.getFamilyActivationStatus(familyId);
  }

  @Get(':familyId/provisioning-logs')
  @ResponseMessage('Lấy provisioning logs của workspace thành công')
  @ApiOperation({ summary: 'List provisioning logs of a family workspace' })
  @ApiParam({ name: 'familyId', description: 'Family UUID' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: ProvisioningStatus })
  @ApiQuery({
    name: 'actionType',
    required: false,
    enum: ProvisioningActionType,
  })
  @ApiResponse({ status: 404, description: 'Family workspace not found' })
  getProvisioningLogs(
    @Param('familyId') familyId: string,
    @Query() query: ListProvisioningLogsQueryDto,
  ) {
    return this.admin.listFamilyProvisioningLogs(familyId, query);
  }

  @Post(':familyId/provisioning/retry')
  @ResponseMessage('Retry provisioning workspace thành công.')
  @ApiOperation({ summary: 'Retry workspace provisioning' })
  @ApiParam({ name: 'familyId', description: 'Family UUID' })
  @ApiBody({ type: RetryProvisioningDto })
  @ApiResponse({ status: 400, description: 'Invalid simulated result' })
  @ApiResponse({ status: 404, description: 'Family workspace not found' })
  async retryProvisioning(
    @Param('familyId') familyId: string,
    @CurrentUser() adminUser: SafeUser,
    @Req() request: Request,
    @Body() dto: RetryProvisioningDto,
  ) {
    try {
      const result = await this.admin.retryWorkspaceProvisioning(
        familyId,
        adminUser.id,
        dto,
      );
      await this.auditLogs.record({
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.fullName,
        action: 'ADMIN_PROVISIONING_RETRY',
        targetType: 'PROVISIONING',
        targetId: familyId,
        result: 'SUCCESS',
        ...this.auditLogs.requestContext(request),
        metadata: dto,
      });
      return result;
    } catch (error) {
      await this.auditLogs.record({
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.fullName,
        action: 'ADMIN_PROVISIONING_RETRY',
        targetType: 'PROVISIONING',
        targetId: familyId,
        result: 'FAILED',
        ...this.auditLogs.requestContext(request),
        metadata: dto,
        errorMessage: this.auditLogs.errorMessage(error),
      });
      throw error;
    }
  }

  @Post(':familyId/subscription/manual-renew')
  @ResponseMessage('Gia hạn gói dịch vụ thủ công thành công.')
  @ApiOperation({ summary: 'Manually renew a family subscription' })
  @ApiParam({ name: 'familyId', description: 'Family UUID' })
  @ApiBody({ type: ManualRenewSubscriptionDto })
  @ApiResponse({ status: 400, description: 'Invalid renew request' })
  @ApiResponse({ status: 404, description: 'Family or plan not found' })
  async manualRenewSubscription(
    @Param('familyId') familyId: string,
    @CurrentUser() adminUser: SafeUser,
    @Req() request: Request,
    @Body() dto: ManualRenewSubscriptionDto,
  ) {
    try {
      const result = await this.admin.manualRenewSubscription(
        familyId,
        adminUser.id,
        dto,
      );
      await this.auditLogs.record({
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.fullName,
        action: 'ADMIN_SUBSCRIPTION_MANUAL_RENEW',
        targetType: 'SUBSCRIPTION',
        targetId: familyId,
        result: 'SUCCESS',
        ...this.auditLogs.requestContext(request),
        metadata: dto,
      });
      return result;
    } catch (error) {
      await this.auditLogs.record({
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.fullName,
        action: 'ADMIN_SUBSCRIPTION_MANUAL_RENEW',
        targetType: 'SUBSCRIPTION',
        targetId: familyId,
        result: 'FAILED',
        ...this.auditLogs.requestContext(request),
        metadata: dto,
        errorMessage: this.auditLogs.errorMessage(error),
      });
      throw error;
    }
  }

  @Patch(':familyId/subscription/status')
  @ResponseMessage('Cập nhật trạng thái gói dịch vụ thành công.')
  @ApiOperation({ summary: 'Manually update a family subscription status' })
  @ApiParam({ name: 'familyId', description: 'Family UUID' })
  @ApiBody({ type: UpdateSubscriptionStatusDto })
  @ApiResponse({ status: 400, description: 'Invalid subscription status' })
  @ApiResponse({ status: 404, description: 'Family or subscription not found' })
  async updateSubscriptionStatus(
    @Param('familyId') familyId: string,
    @CurrentUser() adminUser: SafeUser,
    @Req() request: Request,
    @Body() dto: UpdateSubscriptionStatusDto,
  ) {
    try {
      const result = await this.admin.updateSubscriptionStatus(familyId, dto);
      await this.auditLogs.record({
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.fullName,
        action: 'ADMIN_SUBSCRIPTION_STATUS_UPDATE',
        targetType: 'SUBSCRIPTION',
        targetId: familyId,
        result: 'SUCCESS',
        ...this.auditLogs.requestContext(request),
        metadata: dto,
      });
      return result;
    } catch (error) {
      await this.auditLogs.record({
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.fullName,
        action: 'ADMIN_SUBSCRIPTION_STATUS_UPDATE',
        targetType: 'SUBSCRIPTION',
        targetId: familyId,
        result: 'FAILED',
        ...this.auditLogs.requestContext(request),
        metadata: dto,
        errorMessage: this.auditLogs.errorMessage(error),
      });
      throw error;
    }
  }

  @Post(':familyId/subscription/sync-stripe')
  @ResponseMessage('Đồng bộ subscription từ Stripe thành công.')
  @ApiOperation({ summary: 'Sync a family subscription from Stripe' })
  @ApiParam({ name: 'familyId', description: 'Family UUID' })
  @ApiResponse({
    status: 400,
    description: 'Family workspace has no Stripe subscription to sync',
  })
  @ApiResponse({ status: 404, description: 'Family or subscription not found' })
  async syncSubscriptionFromStripe(
    @Param('familyId') familyId: string,
    @CurrentUser() adminUser: SafeUser,
    @Req() request: Request,
  ) {
    try {
      const result =
        await this.admin.syncFamilySubscriptionFromStripe(familyId);
      await this.auditLogs.record({
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.fullName,
        action: 'ADMIN_SUBSCRIPTION_STRIPE_SYNC',
        targetType: 'SUBSCRIPTION',
        targetId: familyId,
        result: 'SUCCESS',
        ...this.auditLogs.requestContext(request),
        metadata: { source: 'stripe' },
      });
      return result;
    } catch (error) {
      await this.auditLogs.record({
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        adminName: adminUser.fullName,
        action: 'ADMIN_SUBSCRIPTION_STRIPE_SYNC',
        targetType: 'SUBSCRIPTION',
        targetId: familyId,
        result: 'FAILED',
        ...this.auditLogs.requestContext(request),
        metadata: { source: 'stripe' },
        errorMessage: this.auditLogs.errorMessage(error),
      });
      throw error;
    }
  }

  @Patch(':id')
  @ResponseMessage('Cập nhật gia đình thành công')
  @ApiOperation({ summary: 'Update a family' })
  @ApiParam({ name: 'id', description: 'Family UUID' })
  @ApiBody({ type: AdminUpdateFamilyDto })
  @ApiResponse({ status: 404, description: 'Family not found' })
  update(@Param('id') id: string, @Body() dto: AdminUpdateFamilyDto) {
    return this.admin.updateFamily(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Xóa gia đình thành công')
  @ApiOperation({ summary: 'Delete a family (cascades members + invitations)' })
  @ApiParam({ name: 'id', description: 'Family UUID' })
  @ApiResponse({ status: 404, description: 'Family not found' })
  remove(@Param('id') id: string) {
    return this.admin.deleteFamily(id);
  }
}
