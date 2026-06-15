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
import { CreateSubscriptionPlanDto } from '../dto/create-subscription-plan.dto';
import { ListSubscriptionPlansQueryDto } from '../dto/list-subscription-plans-query.dto';
import { UpdateSubscriptionPlanDto } from '../dto/update-subscription-plan.dto';
import { SubscriptionPlansService } from '../subscription-plans.service';

@ApiTags('Admin - Subscription Plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.SYSTEM_ADMIN)
@Controller('admin/subscription-plans')
export class AdminSubscriptionPlansController {
  constructor(private readonly plans: SubscriptionPlansService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo gói đăng ký thành công')
  @ApiOperation({ summary: 'Create a subscription plan (SYSTEM_ADMIN only)' })
  @ApiResponse({ status: 409, description: 'Plan code already exists' })
  create(@Body() dto: CreateSubscriptionPlanDto) {
    return this.plans.create(dto);
  }

  @Get()
  @ResponseMessage('Lấy danh sách gói đăng ký thành công')
  @ApiOperation({
    summary: 'List subscription plans (paginated, incl. inactive)',
  })
  list(@Query() query: ListSubscriptionPlansQueryDto) {
    return this.plans.list(query);
  }

  @Get(':id')
  @ResponseMessage('Lấy thông tin gói đăng ký thành công')
  @ApiOperation({ summary: 'Get a subscription plan by id' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  get(@Param('id') id: string) {
    return this.plans.getById(id);
  }

  @Patch(':id')
  @ResponseMessage('Cập nhật gói đăng ký thành công')
  @ApiOperation({ summary: 'Update a subscription plan' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  update(@Param('id') id: string, @Body() dto: UpdateSubscriptionPlanDto) {
    return this.plans.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Xóa gói đăng ký thành công')
  @ApiOperation({ summary: 'Delete a subscription plan' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  remove(@Param('id') id: string) {
    return this.plans.remove(id);
  }
}
