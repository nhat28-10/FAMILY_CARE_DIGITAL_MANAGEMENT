import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WearablesService } from '../services/wearables.service';

@ApiTags('Wearables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wearables')
export class MyWearablesController {
  constructor(private readonly wearablesService: WearablesService) {}

  @Get('me')
  @ResponseMessage('Lay wearable cua tai khoan hien tai thanh cong')
  @ApiOperation({
    summary: 'Wearable dang ghep noi cua user account hien tai',
  })
  getMine(@CurrentUser('id') userId: string) {
    return this.wearablesService.getMine(userId);
  }
}
