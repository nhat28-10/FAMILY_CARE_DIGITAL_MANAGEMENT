import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { CallsService } from '../services/calls.service';
import { LiveKitService } from '../services/livekit.service';

/**
 * Webhook LiveKit — nguồn sự thật cho "ai thực sự đang trong phòng" (room/
 * participant events). Không dùng JwtAuthGuard — xác thực bằng chữ ký LiveKit
 * ký trên raw body (giống StripeWebhookController, `rawBody: true` ở main.ts).
 */
@SkipThrottle()
@Controller('calls/webhook')
export class CallsWebhookController {
  constructor(
    private readonly liveKitService: LiveKitService,
    private readonly callsService: CallsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  @ResponseMessage('Webhook đã được tiếp nhận')
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('authorization') authHeader: string,
  ): Promise<{ received: boolean }> {
    if (!req.rawBody) {
      throw new BadRequestException('Thiếu nội dung webhook');
    }
    if (!authHeader) {
      throw new BadRequestException('Thiếu chữ ký webhook');
    }

    let event: Awaited<ReturnType<typeof this.liveKitService.verifyWebhook>>;
    try {
      event = await this.liveKitService.verifyWebhook(
        req.rawBody.toString('utf8'),
        authHeader,
      );
    } catch {
      throw new BadRequestException('Chữ ký webhook không hợp lệ');
    }

    await this.callsService.handleWebhookEvent(event);
    return { received: true };
  }
}
