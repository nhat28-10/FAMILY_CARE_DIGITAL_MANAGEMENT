import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FamilyRole, TaskUnavailabilityStatus } from '@prisma/client';
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
import { HandleTaskUnavailabilityDto } from '../dto/handle-task-unavailability.dto';
import { QueryTaskUnavailabilityDto } from '../dto/query-task-unavailability.dto';
import { ReportTaskUnavailabilityDto } from '../dto/report-task-unavailability.dto';
import { TasksService } from '../services/tasks.service';

const TASK_MANAGER_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
] as const;

@ApiTags('Tasks - Không thể làm công việc')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình cần truy cập báo cáo không thể làm công việc',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/tasks')
export class TaskUnavailabilitiesController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('assignments/:assignmentId/unavailability')
  @ResponseMessage('Báo không thể làm công việc thành công')
  @ApiOperation({
    summary: 'Báo không thể làm công việc được giao',
    description:
      'Chỉ thành viên đang được giao phân công công việc mới được báo không thể làm trong MVP.',
  })
  @ApiParam({
    name: 'assignmentId',
    description: 'ID phân công công việc cần báo không thể làm',
    format: 'uuid',
  })
  @ApiResponse({
    status: 400,
    description:
      'Chỉ có thể báo không thể làm khi công việc đang được giao hoặc đang thực hiện',
  })
  reportTaskUnavailability(
    @Param('familyId') familyId: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: ReportTaskUnavailabilityDto,
  ) {
    return this.tasksService.reportTaskUnavailability(
      familyId,
      assignmentId,
      memberId,
      dto,
    );
  }

  @Get('unavailabilities')
  @ResponseMessage('Lấy danh sách báo cáo không thể làm công việc thành công')
  @ApiOperation({
    summary: 'Lấy danh sách báo cáo không thể làm công việc',
    description:
      'Quản lý và phó thành viên xem tất cả báo cáo trong gia đình; thành viên thường chỉ xem báo cáo của chính mình.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: TaskUnavailabilityStatus,
    description: 'Lọc theo trạng thái báo cáo',
  })
  @ApiQuery({
    name: 'assignmentId',
    required: false,
    description: 'Lọc theo phân công công việc',
  })
  @ApiQuery({
    name: 'reportedByMemberId',
    required: false,
    description: 'Lọc theo thành viên tạo báo cáo',
  })
  listTaskUnavailabilities(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
    @Query() query: QueryTaskUnavailabilityDto,
  ) {
    return this.tasksService.getTaskUnavailabilities(
      familyId,
      memberId,
      familyRole,
      query,
    );
  }

  @Get('unavailabilities/:unavailabilityId')
  @ResponseMessage('Lấy chi tiết báo cáo không thể làm công việc thành công')
  @ApiOperation({
    summary: 'Lấy chi tiết báo cáo không thể làm công việc',
    description:
      'Quản lý và phó thành viên xem được báo cáo; người tạo báo cáo xem được báo cáo của chính mình.',
  })
  @ApiParam({
    name: 'unavailabilityId',
    description: 'ID báo cáo không thể làm công việc',
    format: 'uuid',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy báo cáo không thể làm công việc',
  })
  getTaskUnavailabilityDetail(
    @Param('familyId') familyId: string,
    @Param('unavailabilityId') unavailabilityId: string,
    @CurrentFamilyMember('id') memberId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
  ) {
    return this.tasksService.getTaskUnavailabilityDetail(
      familyId,
      unavailabilityId,
      memberId,
      familyRole,
    );
  }

  @Patch('unavailabilities/:unavailabilityId/cancel')
  @ResponseMessage('Hủy báo cáo không thể làm công việc thành công')
  @ApiOperation({
    summary: 'Hủy báo cáo không thể làm công việc',
    description:
      'Chỉ người tạo báo cáo được hủy báo cáo đang chờ xử lý; không thay đổi phân công công việc.',
  })
  @ApiParam({
    name: 'unavailabilityId',
    description: 'ID báo cáo không thể làm công việc cần hủy',
    format: 'uuid',
  })
  @ApiResponse({
    status: 400,
    description: 'Chỉ có thể hủy báo cáo đang chờ xử lý',
  })
  cancelTaskUnavailability(
    @Param('familyId') familyId: string,
    @Param('unavailabilityId') unavailabilityId: string,
    @CurrentFamilyMember('id') memberId: string,
  ) {
    return this.tasksService.cancelTaskUnavailability(
      familyId,
      unavailabilityId,
      memberId,
    );
  }

  @Patch('unavailabilities/:unavailabilityId/handle')
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @ApiOperation({
    summary: 'Xử lý báo cáo không thể làm công việc',
    description:
      'Quản lý gia đình và phó thành viên xử lý bằng cách giao lại, hủy phân công hoặc đánh dấu đã xử lý.',
  })
  @ApiParam({
    name: 'unavailabilityId',
    description: 'ID báo cáo không thể làm công việc cần xử lý',
    format: 'uuid',
  })
  @ApiResponse({
    status: 400,
    description: 'Báo cáo này đã được xử lý hoặc đã bị hủy',
  })
  handleTaskUnavailability(
    @Param('familyId') familyId: string,
    @Param('unavailabilityId') unavailabilityId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: HandleTaskUnavailabilityDto,
  ) {
    return this.tasksService.handleTaskUnavailability(
      familyId,
      unavailabilityId,
      memberId,
      dto,
    );
  }
}
