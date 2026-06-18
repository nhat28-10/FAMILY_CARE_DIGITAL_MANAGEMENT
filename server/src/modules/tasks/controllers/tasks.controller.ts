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
import { FamilyRole, TaskPriority, TaskStatus, TaskType } from '@prisma/client';
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
import { CurrentFamilyMember } from '../../family-members/decorators/current-family-member.decorator';
import { FamilyRoles } from '../../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../../family-members/guards/family-permission.guard';
import { CreateTaskDto } from '../dto/create-task.dto';
import { TaskQueryDto } from '../dto/task-query.dto';
import { UpdateTaskDto } from '../dto/update-task.dto';
import { TasksService } from '../services/tasks.service';

const TASK_MANAGER_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
] as const;

@ApiTags('Tasks - Công việc')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình cần truy cập công việc',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @ResponseMessage('Lấy danh sách công việc thành công')
  @ApiOperation({
    summary: 'Lấy danh sách công việc của gia đình',
    description:
      'Tất cả thành viên active trong gia đình được xem công việc thuộc gia đình.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: TaskStatus,
    description: 'Lọc công việc theo trạng thái',
  })
  @ApiQuery({
    name: 'taskCategoryId',
    required: false,
    description: 'Lọc công việc theo danh mục',
  })
  @ApiQuery({
    name: 'priority',
    required: false,
    enum: TaskPriority,
    description: 'Lọc công việc theo mức độ ưu tiên',
  })
  @ApiQuery({
    name: 'taskType',
    required: false,
    enum: TaskType,
    description: 'Lọc công việc theo loại công việc',
  })
  listTasks(@Param('familyId') familyId: string, @Query() query: TaskQueryDto) {
    return this.tasksService.listTasks(familyId, query);
  }

  @Post()
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo công việc thành công')
  @ApiOperation({
    summary: 'Tạo công việc cơ bản cho gia đình',
    description:
      'API này chỉ tạo công việc AD_HOC, không tạo phân công hoặc thiết lập thưởng. Công việc lặp lại dùng API lịch lặp riêng.',
  })
  @ApiResponse({
    status: 400,
    description: 'Vui lòng tạo công việc lặp lại bằng API lịch lặp',
  })
  createTask(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.createTask(familyId, memberId, dto);
  }

  @Get(':taskId')
  @ResponseMessage('Lấy chi tiết công việc thành công')
  @ApiOperation({
    summary: 'Lấy chi tiết công việc của gia đình',
    description: 'Chỉ trả về công việc thuộc đúng gia đình trên đường dẫn.',
  })
  @ApiParam({
    name: 'taskId',
    description: 'ID công việc cần xem',
    format: 'uuid',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy công việc',
  })
  getTask(
    @Param('familyId') familyId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.tasksService.getTask(familyId, taskId);
  }

  @Patch(':taskId')
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @ResponseMessage('Cập nhật công việc thành công')
  @ApiOperation({
    summary: 'Cập nhật công việc cơ bản của gia đình',
    description:
      'API này không chuyển công việc thường sang RECURRING. Công việc lặp lại dùng API lịch lặp riêng.',
  })
  @ApiParam({
    name: 'taskId',
    description: 'ID công việc cần cập nhật',
    format: 'uuid',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy công việc',
  })
  updateTask(
    @Param('familyId') familyId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.updateTask(familyId, taskId, dto);
  }

  @Patch(':taskId/cancel')
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @ResponseMessage('Hủy công việc thành công')
  @ApiOperation({
    summary: 'Hủy công việc của gia đình',
    description:
      'Không xóa cứng công việc; chỉ chuyển trạng thái sang CANCELED.',
  })
  @ApiParam({
    name: 'taskId',
    description: 'ID công việc cần hủy',
    format: 'uuid',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy công việc',
  })
  cancelTask(
    @Param('familyId') familyId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.tasksService.cancelTask(familyId, taskId);
  }
}
