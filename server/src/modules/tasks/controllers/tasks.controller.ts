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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  FamilyRole,
  TaskAssignmentStatus,
  TaskCategoryStatus,
  TaskPriority,
  TaskProofType,
  TaskSubmissionStatus,
  TaskStatus,
  TaskType,
} from '@prisma/client';
import {
  ApiBody,
  ApiBearerAuth,
  ApiConsumes,
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
import { CreateTaskCategoryDto } from '../dto/create-task-category.dto';
import { CreateTaskSubmissionDto } from '../dto/create-task-submission.dto';
import { CreateTaskDto } from '../dto/create-task.dto';
import { MyTaskAssignmentQueryDto } from '../dto/my-task-assignment-query.dto';
import { ReassignTaskDto } from '../dto/reassign-task.dto';
import { ReviewTaskSubmissionDto } from '../dto/review-task-submission.dto';
import { TaskAssignmentQueryDto } from '../dto/task-assignment-query.dto';
import { TaskCategoryQueryDto } from '../dto/task-category-query.dto';
import { TaskQueryDto } from '../dto/task-query.dto';
import { TaskSubmissionQueryDto } from '../dto/task-submission-query.dto';
import { UploadTaskProofQueryDto } from '../dto/upload-task-proof-query.dto';
import { UpdateTaskProofDto } from '../dto/update-task-proof.dto';
import { UpdateTaskCategoryDto } from '../dto/update-task-category.dto';
import { UpdateTaskDto } from '../dto/update-task.dto';
import { TasksService, UploadedTaskProofFile } from '../services/tasks.service';

const TASK_MANAGER_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
] as const;

@ApiTags('Tasks')
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

  // Nhóm API danh mục công việc
  @Get('categories')
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

  @Post('categories')
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

  @Patch('categories/:categoryId')
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

  // Nhóm API công việc cơ bản
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
      'Phase 1 chỉ tạo công việc AD_HOC, không tạo phân công hoặc thiết lập thưởng.',
  })
  @ApiResponse({
    status: 400,
    description: 'Công việc lặp lại sẽ được triển khai ở Phase 4',
  })
  createTask(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.createTask(familyId, memberId, dto);
  }

  // Nhóm API phân công công việc
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
  cancelTaskAssignment(
    @Param('familyId') familyId: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.tasksService.cancelTaskAssignment(familyId, assignmentId);
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
  reassignTaskAssignment(
    @Param('familyId') familyId: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: ReassignTaskDto,
  ) {
    return this.tasksService.reassignTaskAssignment(
      familyId,
      assignmentId,
      memberId,
      dto,
    );
  }

  // Nhóm API minh chứng hoàn thành công việc
  @Post('assignments/:assignmentId/submissions')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Nộp minh chứng hoàn thành công việc thành công')
  @ApiOperation({
    summary: 'Nộp minh chứng hoàn thành công việc',
    description:
      'Chỉ thành viên được giao phân công mới được nộp minh chứng hoàn thành công việc. Với IMAGE, VIDEO hoặc FILE, hãy upload file bằng API proofs/upload trước rồi dùng fileUrl trả về trong body JSON này.',
  })
  @ApiParam({
    name: 'assignmentId',
    description: 'ID phân công công việc cần nộp minh chứng',
    format: 'uuid',
  })
  @ApiResponse({
    status: 400,
    description: 'Trạng thái phân công hiện tại không cho phép nộp minh chứng',
  })
  createTaskSubmission(
    @Param('familyId') familyId: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateTaskSubmissionDto,
  ) {
    return this.tasksService.createTaskSubmission(
      familyId,
      assignmentId,
      memberId,
      dto,
    );
  }

  @Get('assignments/:assignmentId/submissions')
  @ResponseMessage('Lấy danh sách minh chứng hoàn thành công việc thành công')
  @ApiOperation({
    summary: 'Lấy danh sách minh chứng hoàn thành của một phân công',
    description:
      'Quản lý và phó thành viên xem tất cả minh chứng; thành viên thường chỉ xem minh chứng của phân công được giao cho mình.',
  })
  @ApiParam({
    name: 'assignmentId',
    description: 'ID phân công công việc cần xem minh chứng',
    format: 'uuid',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: TaskSubmissionStatus,
    description: 'Lọc minh chứng hoàn thành công việc theo trạng thái',
  })
  listTaskSubmissions(
    @Param('familyId') familyId: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentFamilyMember('id') memberId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
    @Query() query: TaskSubmissionQueryDto,
  ) {
    return this.tasksService.listTaskSubmissions(
      familyId,
      assignmentId,
      memberId,
      familyRole,
      query,
    );
  }

  @Get('submissions/:submissionId')
  @ResponseMessage('Lấy chi tiết minh chứng hoàn thành công việc thành công')
  @ApiOperation({
    summary: 'Lấy chi tiết minh chứng hoàn thành công việc',
    description:
      'Quản lý và phó thành viên xem được minh chứng trong gia đình; thành viên thường chỉ xem minh chứng của phân công được giao cho mình.',
  })
  @ApiParam({
    name: 'submissionId',
    description: 'ID minh chứng hoàn thành công việc cần xem',
    format: 'uuid',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy minh chứng hoàn thành công việc',
  })
  getTaskSubmission(
    @Param('familyId') familyId: string,
    @Param('submissionId') submissionId: string,
    @CurrentFamilyMember('id') memberId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
  ) {
    return this.tasksService.getTaskSubmission(
      familyId,
      submissionId,
      memberId,
      familyRole,
    );
  }

  @Patch('submissions/:submissionId/review')
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @ResponseMessage('Duyệt hoặc từ chối hoàn thành công việc thành công')
  @ApiOperation({
    summary: 'Duyệt hoặc từ chối minh chứng hoàn thành công việc',
    description:
      'Quản lý gia đình và phó thành viên được duyệt hoặc từ chối minh chứng đang chờ xem xét.',
  })
  @ApiParam({
    name: 'submissionId',
    description: 'ID minh chứng hoàn thành công việc cần duyệt',
    format: 'uuid',
  })
  @ApiResponse({
    status: 400,
    description: 'Chỉ có thể duyệt minh chứng đang chờ xem xét',
  })
  reviewTaskSubmission(
    @Param('familyId') familyId: string,
    @Param('submissionId') submissionId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: ReviewTaskSubmissionDto,
  ) {
    return this.tasksService.reviewTaskSubmission(
      familyId,
      submissionId,
      memberId,
      dto,
    );
  }

  @Post('proofs/upload')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tải file minh chứng lên thành công')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Tải file minh chứng công việc lên hệ thống',
    description:
      'Tải file ảnh, video hoặc PDF lên local storage và nhận fileUrl để dùng khi nộp minh chứng hoàn thành công việc.',
  })
  @ApiQuery({
    name: 'proofType',
    required: false,
    enum: [TaskProofType.IMAGE, TaskProofType.VIDEO, TaskProofType.FILE],
    description:
      'Loại file minh chứng; nếu không gửi, hệ thống tự xác định theo MIME type',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File minh chứng cần tải lên',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Tải file minh chứng lên thành công',
  })
  uploadTaskProofFile(
    @Param('familyId') familyId: string,
    @UploadedFile() file: UploadedTaskProofFile | undefined,
    @Query() query: UploadTaskProofQueryDto,
  ) {
    return this.tasksService.uploadTaskProofFile(familyId, file, query);
  }

  @Patch('proofs/:proofId')
  @ResponseMessage('Cập nhật minh chứng thành công')
  @ApiOperation({
    summary: 'Cập nhật minh chứng đã nộp',
    description:
      'Chỉ người đã nộp minh chứng được chỉnh sửa khi minh chứng hoàn thành công việc đang chờ xem xét.',
  })
  @ApiParam({
    name: 'proofId',
    description: 'ID minh chứng cần cập nhật',
    format: 'uuid',
  })
  @ApiResponse({
    status: 400,
    description: 'Chỉ được chỉnh sửa minh chứng đang chờ xem xét',
  })
  updateTaskProof(
    @Param('familyId') familyId: string,
    @Param('proofId') proofId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: UpdateTaskProofDto,
  ) {
    return this.tasksService.updateTaskProof(familyId, proofId, memberId, dto);
  }

  @Delete('proofs/:proofId')
  @ResponseMessage('Xóa minh chứng thành công')
  @ApiOperation({
    summary: 'Xóa minh chứng đã nộp',
    description:
      'Chỉ người đã nộp minh chứng được xóa khi minh chứng hoàn thành công việc đang chờ xem xét.',
  })
  @ApiParam({
    name: 'proofId',
    description: 'ID minh chứng cần xóa',
    format: 'uuid',
  })
  @ApiResponse({
    status: 400,
    description: 'Chỉ được xóa minh chứng đang chờ xem xét',
  })
  deleteTaskProof(
    @Param('familyId') familyId: string,
    @Param('proofId') proofId: string,
    @CurrentFamilyMember('id') memberId: string,
  ) {
    return this.tasksService.deleteTaskProof(familyId, proofId, memberId);
  }

  // Nhóm API phân công theo từng công việc
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

  // Nhóm API chi tiết và trạng thái công việc
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
    description: 'Phase 1 không hỗ trợ chuyển công việc sang RECURRING.',
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
