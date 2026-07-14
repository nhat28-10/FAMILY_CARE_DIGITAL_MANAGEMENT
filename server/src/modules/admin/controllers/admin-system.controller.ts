import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserType } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AdminSystemService } from '../admin-system.service';
import {
  AdminSystemHealthResponseDto,
  AdminSystemRuntimeResponseDto,
} from '../dto/admin-response.dto';

@ApiTags('Admin - System')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.SYSTEM_ADMIN)
@Controller('admin/system')
export class AdminSystemController {
  constructor(private readonly system: AdminSystemService) {}

  @Get('health')
  @ResponseMessage('Lấy trạng thái hệ thống thành công')
  @ApiOperation({ summary: 'Get backend and database health' })
  @ApiOkResponse({ type: AdminSystemHealthResponseDto })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  health() {
    return this.system.getHealth();
  }

  @Get('runtime')
  @ResponseMessage('Lấy thông tin runtime thành công')
  @ApiOperation({ summary: 'Get Node.js runtime information' })
  @ApiOkResponse({ type: AdminSystemRuntimeResponseDto })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  runtime() {
    return this.system.getRuntime();
  }
}
