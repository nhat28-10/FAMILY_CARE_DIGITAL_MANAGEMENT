import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ProvisioningActionType,
  ProvisioningStatus,
  UserType,
} from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AdminService } from '../admin.service';
import { ListProvisioningLogsQueryDto } from '../dto/list-provisioning-logs-query.dto';

@ApiTags('Admin - Provisioning Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.SYSTEM_ADMIN)
@Controller('admin/provisioning-logs')
export class AdminProvisioningLogsController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  @ResponseMessage('Lấy danh sách provisioning logs thành công')
  @ApiOperation({ summary: 'List workspace provisioning logs' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'familyId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ProvisioningStatus })
  @ApiQuery({
    name: 'actionType',
    required: false,
    enum: ProvisioningActionType,
  })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  list(@Query() query: ListProvisioningLogsQueryDto) {
    return this.admin.listProvisioningLogs(query);
  }
}
