import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { CreateWearableActivationDto } from '../dto/create-wearable-activation.dto';
import {
  WearableActivationClaimResponseDto,
  WearableActivationResponseDto,
} from '../dto/wearable-activation-response.dto';
import { WearableActivationsService } from '../services/wearable-activations.service';

@ApiTags('Wearable Activations')
@Controller('wearable-activations')
export class WearableActivationsController {
  constructor(
    private readonly wearableActivationsService: WearableActivationsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Da tao ma kich hoat wearable')
  @ApiOperation({
    summary: 'Wear OS tao session va ma FCW de mobile nhap khi ghep noi',
  })
  @ApiCreatedResponse({ type: WearableActivationResponseDto })
  create(@Body() dto: CreateWearableActivationDto) {
    return this.wearableActivationsService.create(dto);
  }

  @Get(':sessionId')
  @ResponseMessage('Lay trang thai kich hoat wearable thanh cong')
  @ApiOperation({ summary: 'Wear OS poll trang thai ghep noi bang sessionId' })
  @ApiOkResponse({ type: WearableActivationResponseDto })
  getStatus(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.wearableActivationsService.getStatus(sessionId);
  }

  @Post(':sessionId/claim')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Wearable da nhan token thanh cong')
  @ApiOperation({
    summary: 'Wear OS claim token sau khi mobile da pair ma FCW',
  })
  @ApiOkResponse({ type: WearableActivationClaimResponseDto })
  claim(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.wearableActivationsService.claim(sessionId);
  }
}
