import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InitiateCallDto } from '../dto/initiate-call.dto';
import { ListCallsQueryDto } from '../dto/list-calls-query.dto';
import { CallsService } from '../services/calls.service';

/**
 * Video/audio call gắn với 1 conversation chat. Quyền không dựa vào
 * FamilyRole (`FamilyPermissionGuard`) mà dựa vào việc caller có đang là
 * `ConversationParticipant` ACTIVE của đúng hội thoại hay không — CallsService
 * tự resolve familyId từ conversation rồi kiểm tra, nên controller chỉ cần
 * `JwtAuthGuard`.
 */
@ApiTags('Calls')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('calls')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Đã khởi tạo cuộc gọi')
  @ApiOperation({ summary: 'Khởi tạo cuộc gọi video trong một hội thoại' })
  initiate(@CurrentUser('id') userId: string, @Body() dto: InitiateCallDto) {
    return this.callsService.initiate(userId, dto);
  }

  @Post(':callId/join')
  @ResponseMessage('Đã tham gia cuộc gọi')
  @ApiOperation({ summary: 'Tham gia cuộc gọi (nhận LiveKit token)' })
  join(
    @CurrentUser('id') userId: string,
    @Param('callId', ParseUUIDPipe) callId: string,
  ) {
    return this.callsService.join(userId, callId);
  }

  @Post(':callId/decline')
  @ResponseMessage('Đã từ chối cuộc gọi')
  @ApiOperation({ summary: 'Từ chối cuộc gọi đến' })
  decline(
    @CurrentUser('id') userId: string,
    @Param('callId', ParseUUIDPipe) callId: string,
  ) {
    return this.callsService.decline(userId, callId);
  }

  @Post(':callId/leave')
  @ResponseMessage('Đã rời cuộc gọi')
  @ApiOperation({ summary: 'Rời cuộc gọi đang diễn ra' })
  leave(
    @CurrentUser('id') userId: string,
    @Param('callId', ParseUUIDPipe) callId: string,
  ) {
    return this.callsService.leave(userId, callId);
  }

  @Post(':callId/end')
  @ResponseMessage('Đã kết thúc cuộc gọi')
  @ApiOperation({
    summary: 'Kết thúc cuộc gọi cho tất cả (chỉ người khởi tạo)',
  })
  end(
    @CurrentUser('id') userId: string,
    @Param('callId', ParseUUIDPipe) callId: string,
  ) {
    return this.callsService.end(userId, callId);
  }

  @Get('conversations/:conversationId')
  @ResponseMessage('Lấy lịch sử cuộc gọi thành công')
  @ApiOperation({
    summary: 'Lịch sử cuộc gọi của một hội thoại (cursor pagination)',
  })
  listHistory(
    @CurrentUser('id') userId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query() query: ListCallsQueryDto,
  ) {
    return this.callsService.listHistory(userId, conversationId, query);
  }
}
