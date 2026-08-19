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
import { FamilyRole, TaskAssignmentStatus, TaskPriority } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
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
import { MyTaskAssignmentQueryDto } from '../dto/my-task-assignment-query.dto';
import { ReassignTaskDto } from '../dto/reassign-task.dto';
import {
  TaskAssignmentApiResponseDto,
  TaskAssignmentListApiResponseDto,
} from '../dto/task-assignment-response.dto';
import { TaskAssignmentQueryDto } from '../dto/task-assignment-query.dto';
import { UpdateTaskAssignmentDto } from '../dto/update-task-assignment.dto';
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
@Controller('families/:familyId/tasks')
export class TaskAssignmentsController {
  constructor(private readonly tasksService: TasksService) {}

  @Post(':taskId/assignments')
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
  @ApiCreatedResponse({ type: TaskAssignmentApiResponseDto })
  createTaskAssignment(
    @Param('familyId') familyId: string,
    @Param('taskId') taskId: string,
    @CurrentFamilyMember('id') memberId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
    @Body() dto: CreateTaskAssignmentDto,
  ) {
    return this.tasksService.createTaskAssignment(
      familyId,
      taskId,
      memberId,
      dto,
      familyRole,
    );
  }

  @Get(':taskId/assignments')
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
  @ApiOkResponse({ type: TaskAssignmentListApiResponseDto })
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

  @Get('my-assignments')
  @ResponseMessage('Lấy danh sách công việc được giao thành công')
  @ApiOperation({
    summary: 'Lấy danh sách công việc được giao cho thành viên hiện tại',
    description:
      'Chỉ trả về các phân công có assignedToMemberId là thành viên hiện tại trong gia đình.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: TaskAssignmentStatus,
    description: 'Lọc theo trạng thái phân công công việc',
  })
  @ApiQuery({
    name: 'priority',
    required: false,
    enum: TaskPriority,
    description: 'Lọc theo mức độ ưu tiên của công việc',
  })
  @ApiQuery({
    name: 'startFrom',
    required: false,
    description: 'Lọc từ thời gian bắt đầu dự kiến',
  })
  @ApiQuery({
    name: 'startTo',
    required: false,
    description: 'Lọc đến thời gian bắt đầu dự kiến',
  })
  @ApiQuery({
    name: 'dueFrom',
    required: false,
    description: 'Lọc từ thời gian kết thúc hoặc hạn hoàn thành',
  })
  @ApiQuery({
    name: 'dueTo',
    required: false,
    description: 'Lọc đến thời gian kết thúc hoặc hạn hoàn thành',
  })
  @ApiOkResponse({ type: TaskAssignmentListApiResponseDto })
  listMyTaskAssignments(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Query() query: MyTaskAssignmentQueryDto,
  ) {
    return this.tasksService.listMyTaskAssignments(familyId, memberId, query);
  }

  @Get('assignments/:assignmentId')
  @ResponseMessage('Lấy chi tiết phân công công việc thành công')
  @ApiOperation({
    summary: 'Lấy chi tiết phân công công việc',
    description:
      'Quản lý và phó thành viên xem được phân công trong gia đình; thành viên thường chỉ xem phân công của chính mình.',
  })
  @ApiParam({
    name: 'assignmentId',
    description: 'ID phân công công việc cần xem',
    format: 'uuid',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy phân công công việc',
  })
  @ApiOkResponse({ type: TaskAssignmentApiResponseDto })
  getTaskAssignment(
    @Param('familyId') familyId: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentFamilyMember('id') memberId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
  ) {
    return this.tasksService.getTaskAssignment(
      familyId,
      assignmentId,
      memberId,
      familyRole,
    );
  }

  @Patch('assignments/:assignmentId')
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @ResponseMessage('Cap nhat thoi han phan cong cong viec thanh cong')
  @ApiOperation({
    summary: 'Gia han hoac cap nhat thoi gian phan cong cong viec',
    description:
      'Manager/deputy cap nhat startAt/dueAt cho phan cong hien tai ma khong doi nguoi duoc giao.',
  })
  @ApiParam({
    name: 'assignmentId',
    description: 'ID phan cong cong viec can cap nhat thoi han',
    format: 'uuid',
  })
  @ApiOkResponse({ type: TaskAssignmentApiResponseDto })
  updateTaskAssignment(
    @Param('familyId') familyId: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentFamilyMember('id') memberId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
    @Body() dto: UpdateTaskAssignmentDto,
  ) {
    return this.tasksService.updateTaskAssignment(
      familyId,
      assignmentId,
      memberId,
      familyRole,
      dto,
    );
  }

  @Patch('assignments/:assignmentId/start')
  @ResponseMessage('Bắt đầu thực hiện công việc thành công')
  @ApiOperation({
    summary: 'Bắt đầu thực hiện phân công công việc',
    description:
      'Chỉ thành viên được giao công việc mới được chuyển phân công từ ASSIGNED sang IN_PROGRESS.',
  })
  @ApiParam({
    name: 'assignmentId',
    description: 'ID phân công công việc cần bắt đầu',
    format: 'uuid',
  })
  @ApiResponse({
    status: 400,
    description: 'Chỉ có thể bắt đầu công việc đang ở trạng thái được giao',
  })
  @ApiOkResponse({ type: TaskAssignmentApiResponseDto })
  startTaskAssignment(
    @Param('familyId') familyId: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentFamilyMember('id') memberId: string,
  ) {
    return this.tasksService.startTaskAssignment(
      familyId,
      assignmentId,
      memberId,
    );
  }

  @Patch('assignments/:assignmentId/cancel')
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @ResponseMessage('Hủy phân công công việc thành công')
  @ApiOperation({
    summary: 'Hủy phân công công việc',
    description:
      'Quản lý gia đình và phó thành viên được hủy phân công, trừ phân công đã được duyệt hoàn thành.',
  })
  @ApiParam({
    name: 'assignmentId',
    description: 'ID phân công công việc cần hủy',
    format: 'uuid',
  })
  @ApiResponse({
    status: 400,
    description: 'Không thể hủy phân công đã được duyệt hoàn thành',
  })
  @ApiOkResponse({ type: TaskAssignmentApiResponseDto })
  cancelTaskAssignment(
    @Param('familyId') familyId: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentFamilyMember('id') memberId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
  ) {
    return this.tasksService.cancelTaskAssignment(
      familyId,
      assignmentId,
      memberId,
      familyRole,
    );
  }

  @Patch('assignments/:assignmentId/reassign')
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @ResponseMessage('Giao lại công việc thành công')
  @ApiOperation({
    summary: 'Giao lại công việc cho thành viên khác',
    description:
      'Quản lý gia đình và phó thành viên được đổi người được giao, cập nhật thời gian dự kiến và đưa trạng thái về ASSIGNED.',
  })
  @ApiParam({
    name: 'assignmentId',
    description: 'ID phân công công việc cần giao lại',
    format: 'uuid',
  })
  @ApiResponse({
    status: 400,
    description: 'Không thể giao lại công việc đã được duyệt hoàn thành',
  })
  @ApiOkResponse({ type: TaskAssignmentApiResponseDto })
  reassignTaskAssignment(
    @Param('familyId') familyId: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentFamilyMember('id') memberId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
    @Body() dto: ReassignTaskDto,
  ) {
    return this.tasksService.reassignTaskAssignment(
      familyId,
      assignmentId,
      memberId,
      dto,
      familyRole,
    );
  }
}
