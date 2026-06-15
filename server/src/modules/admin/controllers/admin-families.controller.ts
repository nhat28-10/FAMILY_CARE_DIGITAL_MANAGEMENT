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
import { ListFamiliesQueryDto } from '../dto/list-families-query.dto';
import { AdminUpdateFamilyDto } from '../dto/update-family.dto';

@ApiTags('Admin - Families')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.SYSTEM_ADMIN)
@Controller('admin/families')
export class AdminFamiliesController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  @ResponseMessage('Lấy danh sách gia đình thành công')
  @ApiOperation({ summary: 'List families (paginated, SYSTEM_ADMIN only)' })
  @ApiResponse({ status: 403, description: 'Requires SYSTEM_ADMIN' })
  list(@Query() query: ListFamiliesQueryDto) {
    return this.admin.listFamilies(query);
  }

  @Get(':id')
  @ResponseMessage('Lấy thông tin gia đình thành công')
  @ApiOperation({ summary: 'Get a family by id (with members)' })
  @ApiResponse({ status: 404, description: 'Family not found' })
  get(@Param('id') id: string) {
    return this.admin.getFamily(id);
  }

  @Patch(':id')
  @ResponseMessage('Cập nhật gia đình thành công')
  @ApiOperation({ summary: 'Update a family' })
  @ApiResponse({ status: 404, description: 'Family not found' })
  update(@Param('id') id: string, @Body() dto: AdminUpdateFamilyDto) {
    return this.admin.updateFamily(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Xóa gia đình thành công')
  @ApiOperation({ summary: 'Delete a family (cascades members + invitations)' })
  @ApiResponse({ status: 404, description: 'Family not found' })
  remove(@Param('id') id: string) {
    return this.admin.deleteFamily(id);
  }
}
