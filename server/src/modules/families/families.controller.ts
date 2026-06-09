import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FamilyRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FamilyRoles } from '../family-members/decorators/family-roles.decorator';
import { FamilyPermissionGuard } from '../family-members/guards/family-permission.guard';
import { CreateFamilyDto } from './dto/create-family.dto';
import { UpdateFamilyDto } from './dto/update-family.dto';
import { FamiliesService } from './families.service';

@ApiTags('Families')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('families')
export class FamiliesController {
  constructor(private readonly familiesService: FamiliesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Family created successfully')
  @ApiOperation({ summary: 'Create a family (creator becomes MANAGER)' })
  @ApiResponse({ status: 201, description: 'Family created' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateFamilyDto) {
    return this.familiesService.create(userId, dto);
  }

  @Get('my')
  @ResponseMessage('Fetched your families successfully')
  @ApiOperation({ summary: 'List families the current user belongs to' })
  myFamilies(@CurrentUser('id') userId: string) {
    return this.familiesService.findMyFamilies(userId);
  }

  @Get(':familyId')
  @UseGuards(FamilyPermissionGuard)
  @ResponseMessage('Fetched family successfully')
  @ApiOperation({ summary: 'Get a family (members only)' })
  @ApiResponse({ status: 403, description: 'Not a member of this family' })
  getOne(@Param('familyId') familyId: string) {
    return this.familiesService.getById(familyId);
  }

  @Patch(':familyId')
  @UseGuards(FamilyPermissionGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @ResponseMessage('Family updated successfully')
  @ApiOperation({ summary: 'Update a family (family MANAGER only)' })
  @ApiResponse({ status: 403, description: 'Requires family MANAGER role' })
  update(@Param('familyId') familyId: string, @Body() dto: UpdateFamilyDto) {
    return this.familiesService.update(familyId, dto);
  }

  @Delete(':familyId/members/:userId')
  @UseGuards(FamilyPermissionGuard)
  @FamilyRoles(FamilyRole.FAMILY_MANAGER)
  @ResponseMessage('Member removed successfully')
  @ApiOperation({ summary: 'Remove a member from the family (MANAGER only)' })
  @ApiResponse({ status: 400, description: 'Cannot remove a family manager' })
  @ApiResponse({ status: 404, description: 'Member not found in this family' })
  removeMember(
    @Param('familyId') familyId: string,
    @Param('userId') userId: string,
  ) {
    return this.familiesService.removeMember(familyId, userId);
  }
}
