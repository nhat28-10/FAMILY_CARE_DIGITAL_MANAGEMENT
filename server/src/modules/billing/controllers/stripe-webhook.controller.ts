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
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Request } from 'express';
import type Stripe from 'stripe';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { StripeService } from '../stripe.service';
import { WebhookService } from '../webhook.service';

/**
 * Public Stripe webhook endpoint. No JWT — authenticity is established by the
 * Stripe signature over the raw request body (enabled via `rawBody: true` in
 * main.ts). This is the source of truth for subscription state changes.
 */
@SkipThrottle()
@Controller('billing/webhooks')
export class StripeWebhookController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly webhookService: WebhookService,
  ) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  @ResponseMessage('Webhook đã được tiếp nhận')
  async handleStripe(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: boolean }> {
    if (!req.rawBody) {
      throw new BadRequestException('Thiếu nội dung webhook');
    }
    if (!signature) {
      throw new BadRequestException('Thiếu chữ ký Stripe');
    }

    let event: Stripe.Event;
    try {
      event = this.stripeService.constructEvent(req.rawBody, signature);
    } catch {
      throw new BadRequestException('Chữ ký webhook không hợp lệ');
    }

    await this.webhookService.handleEvent(event);
    return { received: true };
  }
}
