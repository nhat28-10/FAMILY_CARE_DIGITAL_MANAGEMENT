import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FamilyRole, TaskCategoryStatus } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FamilyRoles } from '../../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../../family-members/guards/family-permission.guard';
import { CreateTaskCategoryDto } from '../dto/create-task-category.dto';
import { TaskCategoryQueryDto } from '../dto/task-category-query.dto';
import { UpdateTaskCategoryDto } from '../dto/update-task-category.dto';
import { TasksService } from '../services/tasks.service';

const TASK_MANAGER_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
] as const;

@ApiTags('Tasks - Danh mục')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình cần truy cập danh mục công việc',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/tasks/categories')
export class TaskCategoriesController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @ResponseMessage('Lấy danh sách danh mục công việc thành công')
  @ApiOperation({
    summary: 'Lấy danh sách danh mục công việc của gia đình',
    description:
      'Tất cả thành viên active trong gia đình được xem danh sách này.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: TaskCategoryStatus,
    description: 'Lọc danh mục công việc theo trạng thái',
  })
  listTaskCategories(
    @Param('familyId') familyId: string,
    @Query() query: TaskCategoryQueryDto,
  ) {
    return this.tasksService.listTaskCategories(familyId, query);
  }

  @Post()
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo danh mục công việc thành công')
  @ApiOperation({
    summary: 'Tạo danh mục công việc cho gia đình',
    description:
      'Chỉ quản lý gia đình và phó thành viên được tạo danh mục công việc.',
  })
  @ApiResponse({
    status: 409,
    description: 'Danh mục công việc đã tồn tại trong gia đình này',
  })
  createTaskCategory(
    @Param('familyId') familyId: string,
    @Body() dto: CreateTaskCategoryDto,
  ) {
    return this.tasksService.createTaskCategory(familyId, dto);
  }

  @Patch(':categoryId')
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @ResponseMessage('Cập nhật danh mục công việc thành công')
  @ApiOperation({
    summary: 'Cập nhật danh mục công việc của gia đình',
    description:
      'Không xóa cứng danh mục; có thể chuyển trạng thái sang INACTIVE.',
  })
  @ApiParam({
    name: 'categoryId',
    description: 'ID danh mục công việc cần cập nhật',
    format: 'uuid',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy danh mục công việc',
  })
  updateTaskCategory(
    @Param('familyId') familyId: string,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateTaskCategoryDto,
  ) {
    return this.tasksService.updateTaskCategory(familyId, categoryId, dto);
  }
}
