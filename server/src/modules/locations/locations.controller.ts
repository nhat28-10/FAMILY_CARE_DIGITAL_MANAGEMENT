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
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentFamilyMember } from '../family-members/decorators/current-family-member.decorator';
import { FamilyPermissionGuard } from '../family-members/guards/family-permission.guard';
import { ToggleLocationSharingDto } from './dto/toggle-location-sharing.dto';
import { UpdateMyLocationDto } from './dto/update-my-location.dto';
import { LocationsService } from './locations.service';

@ApiTags('Locations')
@ApiBearerAuth()
@ApiParam({ name: 'familyId', description: 'ID của gia đình', format: 'uuid' })
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get('members/locations')
  @ResponseMessage('Lấy vị trí gia đình thành công')
  @ApiOperation({
    summary: 'Vị trí mới nhất của các thành viên đang bật chia sẻ',
  })
  @ApiOkResponse({
    description:
      'Mỗi phần tử: { userId, memberId, displayName, avatarUrl, latitude, longitude, accuracy, updatedAt, isSharing }',
  })
  listFamilyLocations(@Param('familyId') familyId: string) {
    return this.locationsService.listFamilyLocations(familyId);
  }

  @Post('locations')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Đã cập nhật vị trí')
  @ApiOperation({ summary: 'Đẩy vị trí hiện tại của chính mình (định kỳ)' })
  pushMyLocation(
    @Param('familyId') familyId: string,
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: UpdateMyLocationDto,
  ) {
    return this.locationsService.pushMyLocation(familyId, memberId, dto);
  }

  @Patch('members/me/location-sharing')
  @ResponseMessage('Đã cập nhật trạng thái chia sẻ vị trí')
  @ApiOperation({ summary: 'Bật/tắt chia sẻ vị trí của chính mình' })
  setMyLocationSharing(
    @CurrentFamilyMember('id') memberId: string,
    @Body() dto: ToggleLocationSharingDto,
  ) {
    return this.locationsService.setMyLocationSharing(memberId, dto.isSharing);
  }
}
