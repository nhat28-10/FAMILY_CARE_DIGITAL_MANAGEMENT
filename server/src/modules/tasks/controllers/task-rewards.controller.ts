import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  FamilyRole,
  RewardDisputeStatus,
  RewardSettlementStatus,
} from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentFamilyMember } from '../../family-members/decorators/current-family-member.decorator';
import { FamilyRoles } from '../../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../../family-members/guards/family-permission.guard';
import { CreateRewardAllocationDto } from '../dto/create-reward-allocation.dto';
import { CreateRewardDisputeDto } from '../dto/create-reward-dispute.dto';
import { CreateRewardSettingDto } from '../dto/create-reward-setting.dto';
import { MarkRewardPaidDto } from '../dto/mark-reward-paid.dto';
import { QueryRewardDisputeDto } from '../dto/query-reward-dispute.dto';
import { RewardSettlementQueryDto } from '../dto/reward-settlement-query.dto';
import { ResolveRewardDisputeDto } from '../dto/resolve-reward-dispute.dto';
import { UpdateRewardSettingDto } from '../dto/update-reward-setting.dto';
import { TasksService } from '../services/tasks.service';

const TASK_MANAGER_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
] as const;

@ApiTags('Tasks - Thưởng')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình cần truy cập cấu hình và ghi nhận thưởng',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/tasks')
export class TaskRewardsController {
  constructor(private readonly tasksService: TasksService) {}

  @Post(':taskId/reward-setting')
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @ResponseMessage('Tạo cấu hình thưởng cho công việc thành công')
  @ApiOperation({
    summary: 'Tạo cấu hình thưởng cho công việc',
    description:
      'Cấu hình thưởng chỉ là ghi nhận nội bộ, không phải giao dịch thanh toán thật.',
  })
  @ApiParam({
    name: 'taskId',
    description: 'ID công việc cần tạo cấu hình thưởng',
    format: 'uuid',
  })
  @ApiResponse({
    status: 409,
    description: 'Công việc đã có cấu hình thưởng',
  })
  createRewardSetting(
    @Param('familyId') familyId: string,
    @Param('taskId') taskId: string,
    @CurrentFamilyMember('id') memberId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
    @Body() dto: CreateRewardSettingDto,
  ) {
    return this.tasksService.createRewardSetting(
      familyId,
      taskId,
      memberId,
      dto,
      familyRole,
    );
  }

  @Get(':taskId/reward-setting')
  @ResponseMessage('Lấy cấu hình thưởng của công việc thành công')
  @ApiOperation({
    summary: 'Lấy cấu hình thưởng của công việc',
    description:
      'Tất cả thành viên active trong gia đình được xem cấu hình thưởng của công việc.',
  })
  @ApiParam({
    name: 'taskId',
    description: 'ID công việc cần xem cấu hình thưởng',
    format: 'uuid',
  })
  @ApiResponse({
    status: 404,
    description: 'Công việc chưa có cấu hình thưởng',
  })
  getRewardSetting(
    @Param('familyId') familyId: string,
    @Param('taskId') taskId: string,
    @CurrentFamilyMember('id') memberId: string,
  ) {
    return this.tasksService.getRewardSetting(familyId, taskId, memberId);
  }

  @Patch(':taskId/reward-setting')
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @ResponseMessage('Cập nhật cấu hình thưởng cho công việc thành công')
  @ApiOperation({
    summary: 'Cập nhật cấu hình thưởng cho công việc',
    description:
      'Thay đổi cấu hình chỉ áp dụng cho các bài nộp được duyệt sau này.',
  })
  @ApiParam({
    name: 'taskId',
    description: 'ID công việc cần cập nhật cấu hình thưởng',
    format: 'uuid',
  })
  updateRewardSetting(
    @Param('familyId') familyId: string,
    @Param('taskId') taskId: string,
    @CurrentFamilyMember('id') memberId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
    @Body() dto: UpdateRewardSettingDto,
  ) {
    return this.tasksService.updateRewardSetting(
      familyId,
      taskId,
      memberId,
      dto,
      familyRole,
    );
  }

  @Delete(':taskId/reward-setting')
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @ResponseMessage('Xóa cấu hình thưởng cho công việc thành công')
  @ApiOperation({
    summary: 'Xóa cấu hình thưởng cho công việc',
    description: 'Chỉ xóa được cấu hình thưởng chưa phát sinh ghi nhận thưởng.',
  })
  @ApiParam({
    name: 'taskId',
    description: 'ID công việc cần xóa cấu hình thưởng',
    format: 'uuid',
  })
  deleteRewardSetting(
    @Param('familyId') familyId: string,
    @Param('taskId') taskId: string,
    @CurrentFamilyMember('id') memberId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
  ) {
    return this.tasksService.deleteRewardSetting(
      familyId,
      taskId,
      memberId,
      familyRole,
    );
  }

  @Post('submissions/:submissionId/reward-settlement')
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @ResponseMessage('Tạo ghi nhận thưởng cho bài nộp thành công')
  @ApiOperation({
    summary: 'Tạo ghi nhận thưởng cho bài nộp',
    description:
      'Tạo thủ công khi cấu hình thưởng không tự tạo settlement; amount và receiver lấy từ bài nộp đã duyệt.',
  })
  @ApiParam({
    name: 'submissionId',
    description: 'ID bài nộp công việc đã được duyệt',
    format: 'uuid',
  })
  createRewardSettlementForSubmission(
    @Param('familyId') familyId: string,
    @Param('submissionId') submissionId: string,
    @CurrentFamilyMember('id') memberId: string,
  ) {
    return this.tasksService.createRewardSettlementForSubmission(
      familyId,
      submissionId,
      memberId,
    );
  }

  @Get('reward-settlements')
  @ResponseMessage('Lấy danh sách ghi nhận thưởng thành công')
  @ApiOperation({
    summary: 'Lấy danh sách ghi nhận thưởng',
    description:
      'Quản lý và phó thành viên xem tất cả; thành viên thường chỉ xem ghi nhận thưởng của chính mình.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: RewardSettlementStatus,
    description: 'Lọc theo trạng thái ghi nhận thưởng',
  })
  @ApiQuery({
    name: 'receiverMemberId',
    required: false,
    description: 'Lọc theo thành viên nhận thưởng',
  })
  @ApiQuery({
    name: 'taskId',
    required: false,
    description: 'Lọc theo công việc',
  })
  getRewardSettlements(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
    @Query() query: RewardSettlementQueryDto,
  ) {
    return this.tasksService.getRewardSettlements(
      familyId,
      memberId,
      familyRole,
      query,
    );
  }

  @Get('reward-settlements/:settlementId')
  @ResponseMessage('Lấy chi tiết ghi nhận thưởng thành công')
  @ApiOperation({
    summary: 'Lấy chi tiết ghi nhận thưởng',
    description:
      'Quản lý và phó thành viên xem được; người nhận thưởng xem được ghi nhận thưởng của chính mình.',
  })
  @ApiParam({
    name: 'settlementId',
    description: 'ID ghi nhận thưởng cần xem',
    format: 'uuid',
  })
  getRewardSettlementDetail(
    @Param('familyId') familyId: string,
    @Param('settlementId') settlementId: string,
    @CurrentFamilyMember('id') memberId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
  ) {
    return this.tasksService.getRewardSettlementDetail(
      familyId,
      settlementId,
      memberId,
      familyRole,
    );
  }

  @Post('reward-settlements/:settlementId/allocations')
  @ResponseMessage('Phân bổ thưởng thành công')
  @ApiOperation({
    summary: 'Phân bổ thưởng đã nhận vào quỹ hoặc mục tiêu tài chính',
    description:
      'Người nhận thưởng phân bổ thưởng đã xác nhận vào quỹ hoặc mục tiêu tài chính. Reward trong hệ thống chỉ là ghi nhận nội bộ, không phải giao dịch thanh toán thật.',
  })
  @ApiParam({
    name: 'settlementId',
    description: 'ID ghi nhận thưởng cần phân bổ',
    format: 'uuid',
  })
  createRewardAllocations(
    @Param('familyId') familyId: string,
    @Param('settlementId') settlementId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateRewardAllocationDto,
  ) {
    return this.tasksService.createRewardAllocations(
      familyId,
      settlementId,
      memberId,
      dto,
    );
  }

  @Get('reward-settlements/:settlementId/allocations')
  @ResponseMessage('Lấy danh sách phân bổ thưởng thành công')
  @ApiOperation({
    summary: 'Lấy danh sách phân bổ thưởng',
    description:
      'Quản lý và phó thành viên xem được; người nhận thưởng xem được phân bổ thưởng của chính mình.',
  })
  @ApiParam({
    name: 'settlementId',
    description: 'ID ghi nhận thưởng cần xem phân bổ',
    format: 'uuid',
  })
  getRewardAllocations(
    @Param('familyId') familyId: string,
    @Param('settlementId') settlementId: string,
    @CurrentFamilyMember('id') memberId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
    @Query() query: PaginationQueryDto,
  ) {
    return this.tasksService.getRewardAllocations(
      familyId,
      settlementId,
      memberId,
      familyRole,
      query,
    );
  }

  @Post('reward-settlements/:settlementId/disputes')
  @ResponseMessage('Gửi tranh chấp thưởng thành công')
  @ApiOperation({
    summary: 'Báo chưa nhận được thưởng',
    description:
      'Người nhận thưởng báo chưa nhận được thưởng sau khi quản lý hoặc phó thành viên ghi nhận đã trả ngoài hệ thống.',
  })
  @ApiParam({
    name: 'settlementId',
    description: 'ID ghi nhận thưởng cần gửi tranh chấp',
    format: 'uuid',
  })
  createRewardDispute(
    @Param('familyId') familyId: string,
    @Param('settlementId') settlementId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: CreateRewardDisputeDto,
  ) {
    return this.tasksService.createRewardDispute(
      familyId,
      settlementId,
      memberId,
      dto,
    );
  }

  @Get('reward-disputes')
  @ResponseMessage('Lấy danh sách tranh chấp thưởng thành công')
  @ApiOperation({
    summary: 'Lấy danh sách tranh chấp thưởng',
    description:
      'Quản lý và phó thành viên xem tất cả tranh chấp trong gia đình; thành viên thường chỉ xem tranh chấp do chính mình tạo.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: RewardDisputeStatus,
    description: 'Lọc theo trạng thái tranh chấp thưởng',
  })
  @ApiQuery({
    name: 'rewardSettlementId',
    required: false,
    description: 'Lọc theo ghi nhận thưởng',
  })
  @ApiQuery({
    name: 'reportedByMemberId',
    required: false,
    description: 'Lọc theo thành viên gửi tranh chấp',
  })
  getRewardDisputes(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
    @Query() query: QueryRewardDisputeDto,
  ) {
    return this.tasksService.getRewardDisputes(
      familyId,
      memberId,
      familyRole,
      query,
    );
  }

  @Get('reward-disputes/:disputeId')
  @ResponseMessage('Lấy chi tiết tranh chấp thưởng thành công')
  @ApiOperation({
    summary: 'Lấy chi tiết tranh chấp thưởng',
    description:
      'Quản lý và phó thành viên xem được; người gửi tranh chấp xem được tranh chấp của chính mình.',
  })
  @ApiParam({
    name: 'disputeId',
    description: 'ID tranh chấp thưởng cần xem',
    format: 'uuid',
  })
  getRewardDisputeDetail(
    @Param('familyId') familyId: string,
    @Param('disputeId') disputeId: string,
    @CurrentFamilyMember('id') memberId: string,
    @CurrentFamilyMember('familyRole') familyRole: FamilyRole,
  ) {
    return this.tasksService.getRewardDisputeDetail(
      familyId,
      disputeId,
      memberId,
      familyRole,
    );
  }

  @Patch('reward-disputes/:disputeId/resolve')
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @ResponseMessage('Xử lý tranh chấp thưởng thành công')
  @ApiOperation({
    summary: 'Xử lý tranh chấp thưởng',
    description:
      'Quản lý hoặc phó thành viên chấp nhận hoặc từ chối tranh chấp thưởng. Không tạo thanh toán thật và không tự chuyển settlement thành đã hoàn tất.',
  })
  @ApiParam({
    name: 'disputeId',
    description: 'ID tranh chấp thưởng cần xử lý',
    format: 'uuid',
  })
  resolveRewardDispute(
    @Param('familyId') familyId: string,
    @Param('disputeId') disputeId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: ResolveRewardDisputeDto,
  ) {
    return this.tasksService.resolveRewardDispute(
      familyId,
      disputeId,
      memberId,
      dto,
    );
  }

  @Patch('reward-settlements/:settlementId/mark-paid')
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @ResponseMessage('Ghi nhận đã trả thưởng ngoài hệ thống thành công')
  @ApiOperation({
    summary: 'Ghi nhận đã trả thưởng ngoài hệ thống',
    description:
      'Chỉ ghi nhận nội bộ việc đã trả thưởng bằng tiền mặt, chuyển khoản hoặc ví bên thứ ba; không tạo thanh toán thật.',
  })
  markRewardPaid(
    @Param('familyId') familyId: string,
    @Param('settlementId') settlementId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: MarkRewardPaidDto,
  ) {
    return this.tasksService.markRewardPaid(
      familyId,
      settlementId,
      memberId,
      dto,
    );
  }

  @Patch('reward-settlements/:settlementId/confirm-received')
  @ResponseMessage('Xác nhận đã nhận thưởng thành công')
  @ApiOperation({
    summary: 'Xác nhận đã nhận thưởng',
    description:
      'Chỉ người nhận thưởng được xác nhận đã nhận thưởng ngoài hệ thống.',
  })
  confirmRewardReceived(
    @Param('familyId') familyId: string,
    @Param('settlementId') settlementId: string,
    @CurrentFamilyMember('id') memberId: string,
  ) {
    return this.tasksService.confirmRewardReceived(
      familyId,
      settlementId,
      memberId,
    );
  }

  @Patch('reward-settlements/:settlementId/cancel')
  @FamilyRoles(...TASK_MANAGER_ROLES)
  @ResponseMessage('Hủy ghi nhận thưởng thành công')
  @ApiOperation({
    summary: 'Hủy ghi nhận thưởng',
    description:
      'Chỉ hủy được ghi nhận thưởng đang chờ trả hoặc đang chờ xác nhận.',
  })
  cancelRewardSettlement(
    @Param('familyId') familyId: string,
    @Param('settlementId') settlementId: string,
    @CurrentFamilyMember('id') memberId: string,
  ) {
    return this.tasksService.cancelRewardSettlement(
      familyId,
      settlementId,
      memberId,
    );
  }
}
