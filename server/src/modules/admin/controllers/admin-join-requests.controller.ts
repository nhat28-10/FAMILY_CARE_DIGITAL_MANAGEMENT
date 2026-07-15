import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JoinRequestStatus, UserType } from '@prisma/client';
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
import { AdminService } from '../admin.service';
import { ListJoinRequestsQueryDto } from '../dto/list-join-requests-query.dto';

@ApiTags('Admin - Join Requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.SYSTEM_ADMIN)
@Controller('admin/join-requests')
export class AdminJoinRequestsController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  @ResponseMessage('Lấy danh sách yêu cầu tham gia thành công')
  @ApiOperation({ summary: 'List join requests (paginated, SYSTEM_ADMIN)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: JoinRequestStatus })
  @ApiQuery({ name: 'familyId', required: false, type: String })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  list(@Query() query: ListJoinRequestsQueryDto) {
    return this.admin.listJoinRequests(query);
  }

  @Get(':id')
  @ResponseMessage('Lấy thông tin yêu cầu tham gia thành công')
  @ApiOperation({ summary: 'Get a join request by id' })
  @ApiParam({ name: 'id', description: 'Join request UUID' })
  @ApiResponse({ status: 404, description: 'Join request not found' })
  get(@Param('id') id: string) {
    return this.admin.getJoinRequest(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Xóa yêu cầu tham gia thành công')
  @ApiOperation({ summary: 'Delete a join request' })
  @ApiParam({ name: 'id', description: 'Join request UUID' })
  @ApiResponse({ status: 404, description: 'Join request not found' })
  remove(@Param('id') id: string) {
    return this.admin.deleteJoinRequest(id);
  }
}
