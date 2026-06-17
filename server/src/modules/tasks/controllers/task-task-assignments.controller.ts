import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FamilyRole, TaskAssignmentStatus } from '@prisma/client';
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
import { CreateTaskAssignmentDto } from '../dto/create-task-assignment.dto';
import { TaskAssignmentQueryDto } from '../dto/task-assignment-query.dto';
import { TasksService } from '../services/tasks.service';

const TASK_MANAGER_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
] as const;

@ApiTags('Tasks - Phân công')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình cần truy cập phân công công việc',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/tasks/:taskId/assignments')
export class TaskTaskAssignmentsController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Giao công việc thành công')
  @ApiOperation({
    summary: 'Giao công việc cho thành viên trong gia đình',
    description:
      'Chỉ quản lý gia đình và phó thành viên được giao công việc cho thành viên active trong cùng gia đình.',
  })
  @ApiParam({
    name: 'taskId',
    description: 'ID công việc cần giao',
    format: 'uuid',
  })
  @ApiResponse({
    status: 409,
    description: 'Thành viên này đã được giao công việc này',
  })
  createTaskAssignment(
    @Param('familyId') familyId: string,
    @Param('taskId') taskId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateTaskAssignmentDto,
  ) {
    return this.tasksService.createTaskAssignment(
      familyId,
      taskId,
      memberId,
      dto,
    );
  }

  @Get()
  @ResponseMessage('Lấy danh sách phân công công việc thành công')
  @ApiOperation({
    summary: 'Lấy danh sách phân công của một công việc',
    description:
      'Quản lý và phó thành viên xem tất cả phân công của công việc; thành viên thường chỉ xem phân công của chính mình.',
  })
  @ApiParam({
    name: 'taskId',
    description: 'ID công việc cần xem danh sách phân công',
    format: 'uuid',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: TaskAssignmentStatus,
    description: 'Lọc phân công công việc theo trạng thái',
  })
  listTaskAssignments(
    @Param('familyId') familyId: string,
    @Param('taskId') taskId: string,
    @CurrentFamilyMember('id') memberId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
    @Query() query: TaskAssignmentQueryDto,
  ) {
    return this.tasksService.listTaskAssignments(
      familyId,
      taskId,
      memberId,
      familyRole,
      query,
    );
  }
}
