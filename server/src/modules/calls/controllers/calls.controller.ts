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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  CallActionResponseDto,
  CallHistoryResponseDto,
  CallResponseDto,
  InitiateCallResponseDto,
  JoinCallResponseDto,
} from '../dto/call-response.dto';
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
@ApiResponse({
  status: 403,
  description:
    'NOT_FAMILY_MEMBER — bạn không thuộc gia đình của hội thoại này.',
})
@ApiResponse({
  status: 404,
  description:
    'CONVERSATION_NOT_FOUND — không tìm thấy hội thoại (conversationId sai/không thuộc bạn).',
})
@Controller('calls')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Đã khởi tạo cuộc gọi')
  @ApiOperation({ summary: 'Khởi tạo cuộc gọi video trong một hội thoại' })
  @ApiCreatedResponse({ type: InitiateCallResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'CONVERSATION_ARCHIVED / CALL_ALREADY_ACTIVE (đã có cuộc gọi RINGING/ONGOING) / CONVERSATION_TOO_FEW_MEMBERS.',
  })
  @ApiResponse({
    status: 503,
    description: 'LIVEKIT_NOT_CONFIGURED — server chưa cấu hình LiveKit.',
  })
  initiate(@CurrentUser('id') userId: string, @Body() dto: InitiateCallDto) {
    return this.callsService.initiate(userId, dto);
  }

  @Post(':callId/join')
  @ResponseMessage('Đã tham gia cuộc gọi')
  @ApiOperation({ summary: 'Tham gia cuộc gọi (nhận LiveKit token)' })
  @ApiOkResponse({ type: JoinCallResponseDto })
  @ApiResponse({
    status: 400,
    description: 'CALL_ALREADY_ENDED — cuộc gọi đã kết thúc.',
  })
  @ApiResponse({
    status: 403,
    description: 'NOT_INVITED — bạn không được mời vào cuộc gọi này.',
  })
  @ApiResponse({
    status: 404,
    description: 'CALL_NOT_FOUND — không tìm thấy cuộc gọi.',
  })
  @ApiResponse({
    status: 503,
    description: 'LIVEKIT_NOT_CONFIGURED — server chưa cấu hình LiveKit.',
  })
  join(
    @CurrentUser('id') userId: string,
    @Param('callId', ParseUUIDPipe) callId: string,
  ) {
    return this.callsService.join(userId, callId);
  }

  @Post(':callId/decline')
  @ResponseMessage('Đã từ chối cuộc gọi')
  @ApiOperation({ summary: 'Từ chối cuộc gọi đến' })
  @ApiOkResponse({ type: CallActionResponseDto })
  @ApiResponse({
    status: 403,
    description: 'NOT_INVITED — bạn không được mời vào cuộc gọi này.',
  })
  @ApiResponse({
    status: 404,
    description: 'CALL_NOT_FOUND — không tìm thấy cuộc gọi.',
  })
  decline(
    @CurrentUser('id') userId: string,
    @Param('callId', ParseUUIDPipe) callId: string,
  ) {
    return this.callsService.decline(userId, callId);
  }

  @Post(':callId/leave')
  @ResponseMessage('Đã rời cuộc gọi')
  @ApiOperation({ summary: 'Rời cuộc gọi đang diễn ra' })
  @ApiOkResponse({ type: CallActionResponseDto })
  @ApiResponse({
    status: 403,
    description: 'NOT_IN_CALL — bạn không ở trong cuộc gọi này.',
  })
  @ApiResponse({
    status: 404,
    description: 'CALL_NOT_FOUND — không tìm thấy cuộc gọi.',
  })
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
  @ApiOkResponse({ type: CallActionResponseDto })
  @ApiResponse({
    status: 403,
    description:
      'NOT_INITIATOR — chỉ người khởi tạo mới được kết thúc cuộc gọi cho tất cả.',
  })
  @ApiResponse({
    status: 404,
    description: 'CALL_NOT_FOUND — không tìm thấy cuộc gọi.',
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
  @ApiOkResponse({ type: CallHistoryResponseDto })
  listHistory(
    @CurrentUser('id') userId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query() query: ListCallsQueryDto,
  ) {
    return this.callsService.listHistory(userId, conversationId, query);
  }

  // Khai báo SAU `conversations/:conversationId` — nếu đứng trước, Nest sẽ
  // match nhầm `GET /calls/conversations` vào `:callId = 'conversations'`.
  @Get(':callId')
  @ResponseMessage('Lấy thông tin cuộc gọi thành công')
  @ApiOperation({
    summary: 'Lấy 1 cuộc gọi theo id (phục hồi trạng thái sau reconnect)',
  })
  @ApiOkResponse({ type: CallResponseDto })
  @ApiResponse({
    status: 404,
    description: 'CALL_NOT_FOUND — không tìm thấy cuộc gọi.',
  })
  getOne(
    @CurrentUser('id') userId: string,
    @Param('callId', ParseUUIDPipe) callId: string,
  ) {
    return this.callsService.getOne(userId, callId);
  }
}
