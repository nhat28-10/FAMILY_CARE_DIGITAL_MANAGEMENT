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
import { FamilyRole, TaskSubmissionStatus } from '@prisma/client';
import {
  ApiBearerAuth,
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
import { CreateTaskSubmissionDto } from '../dto/create-task-submission.dto';
import { ReviewTaskSubmissionDto } from '../dto/review-task-submission.dto';
import { TaskSubmissionQueryDto } from '../dto/task-submission-query.dto';
import { TaskSubmissionListApiResponseDto } from '../dto/task-submission-response.dto';
import { TasksService } from '../services/tasks.service';

const TASK_MANAGER_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
] as const;

@ApiTags('Tasks - Minh chứng')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình cần truy cập minh chứng công việc',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/tasks')
export class TaskSubmissionsController {
  constructor(private readonly tasksService: TasksService) {}

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
      'Quản lý và phó thành viên xem tất cả minh chứng; thành viên thường chỉ xem minh chứng của phân công được giao cho mình. Danh sách trả về proofCount và metadata proofs của ảnh, video, file hoặc ghi chú minh chứng.',
  })
  @ApiOkResponse({
    description:
      'Danh sách submission theo trang, mỗi item giữ proofCount và có mảng proofs',
    type: TaskSubmissionListApiResponseDto,
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
}
