import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FamilyRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentFamilyMember } from '../../family-members/decorators/current-family-member.decorator';
import { FamilyRoles } from '../../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../../family-members/guards/family-permission.guard';
import { CreateRecurringTaskDto } from '../dto/create-recurring-task.dto';
import { GenerateTaskAssignmentsDto } from '../dto/generate-task-assignments.dto';
import { UpdateTaskScheduleDto } from '../dto/update-task-schedule.dto';
import { TasksService } from '../services/tasks.service';

const TASK_MANAGER_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
] as const;

@ApiTags('Tasks - Công việc lặp lại thường xuyên')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình cần truy cập lịch lặp công việc',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/tasks')
export class TaskSchedulesController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('recurring')
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo công việc lặp lại thành công')
  @ApiOperation({
    summary: 'Tạo công việc lặp lại cho gia đình',
    description:
      'Tạo công việc RECURRING kèm lịch lặp, chưa sinh phân công và chưa tạo thưởng.',
  })
  @ApiResponse({
    status: 201,
    description: 'Tạo công việc lặp lại thành công',
  })
  createRecurringTask(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateRecurringTaskDto,
  ) {
    return this.tasksService.createRecurringTask(familyId, memberId, dto);
  }

  @Get(':taskId/schedule')
  @ResponseMessage('Lấy lịch lặp công việc thành công')
  @ApiOperation({
    summary: 'Lấy lịch lặp của công việc',
    description:
      'Tất cả thành viên active trong gia đình được xem lịch lặp của công việc RECURRING.',
  })
  @ApiParam({
    name: 'taskId',
    description: 'ID công việc cần xem lịch lặp',
    format: 'uuid',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy lịch lặp của công việc',
  })
  getTaskSchedule(
    @Param('familyId') familyId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.tasksService.getTaskSchedule(familyId, taskId);
  }

  @Patch(':taskId/schedule')
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @ResponseMessage('Cập nhật lịch lặp công việc thành công')
  @ApiOperation({
    summary: 'Cập nhật lịch lặp của công việc',
    description:
      'Cập nhật lịch lặp cho các lần sinh phân công sau, không chỉnh các phân công đã sinh.',
  })
  @ApiParam({
    name: 'taskId',
    description: 'ID công việc cần cập nhật lịch lặp',
    format: 'uuid',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy lịch lặp của công việc',
  })
  updateTaskSchedule(
    @Param('familyId') familyId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskScheduleDto,
  ) {
    return this.tasksService.updateTaskSchedule(familyId, taskId, dto);
  }

  @Post(':taskId/schedule/generate-assignments')
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Sinh phân công công việc lặp lại thành công')
  @ApiOperation({
    summary: 'Sinh phân công thủ công cho công việc lặp lại',
    description:
      'Sinh TaskAssignment theo lịch lặp trong khoảng ngày được chọn, bỏ qua phân công bị trùng.',
  })
  @ApiParam({
    name: 'taskId',
    description: 'ID công việc lặp lại cần sinh phân công',
    format: 'uuid',
  })
  @ApiResponse({
    status: 400,
    description: 'Khoảng thời gian sinh phân công không hợp lệ',
  })
  generateRecurringTaskAssignments(
    @Param('familyId') familyId: string,
    @Param('taskId') taskId: string,
    @CurrentFamilyMember('id') memberId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
    @Body() dto: GenerateTaskAssignmentsDto,
  ) {
    return this.tasksService.generateRecurringTaskAssignments(
      familyId,
      taskId,
      memberId,
      dto,
      familyRole,
    );
  }
}
