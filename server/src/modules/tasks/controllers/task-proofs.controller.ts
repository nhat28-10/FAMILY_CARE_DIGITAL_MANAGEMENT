import {
  Body,
  Controller,
  Delete,
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
import { TaskProofType } from '@prisma/client';
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
import { FamilyPermissionGuard } from '../../family-members/guards/family-permission.guard';
import { UploadTaskProofQueryDto } from '../dto/upload-task-proof-query.dto';
import { UpdateTaskProofDto } from '../dto/update-task-proof.dto';
import { TasksService, UploadedTaskProofFile } from '../services/tasks.service';

@ApiTags('Tasks - File minh chứng')
@ApiBearerAuth()
@ApiParam({
  name: 'familyId',
  description: 'ID của gia đình cần truy cập file minh chứng',
  format: 'uuid',
})
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/tasks/proofs')
export class TaskProofsController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('upload')
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

  @Patch(':proofId')
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

  @Delete(':proofId')
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
}
