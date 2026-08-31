import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { FamilyMember } from '@prisma/client';

import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentFamilyMember } from '../family-members/decorators/current-family-member.decorator';
import { FamilyPermissionGuard } from '../family-members/guards/family-permission.guard';
import type { UploadedFilePayload } from '../storage/storage.service';
import {
  DeleteFaceProfileDto,
  EnrollFaceProfileDto,
  FaceProfileSummaryApiResponseDto,
} from './dto/face-profile.dto';
import {
  FACE_ENROLLMENT_MAX_FILE_SIZE,
  FACE_ENROLLMENT_MAX_FILES,
} from './face-enrollment.validator';
import { FaceProfilesService } from './face-profiles.service';

@ApiTags('Face Profiles')
@ApiBearerAuth()
@ApiParam({ name: 'familyId', description: 'ID gia dinh', format: 'uuid' })
@UseGuards(JwtAuthGuard, FamilyPermissionGuard)
@Controller('families/:familyId/face-profiles')
export class FaceProfilesController {
  constructor(private readonly faceProfiles: FaceProfilesService) {}

  @Post(':memberId/enroll')
  @UseInterceptors(
    FilesInterceptor('files', FACE_ENROLLMENT_MAX_FILES, {
      limits: { fileSize: FACE_ENROLLMENT_MAX_FILE_SIZE },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'memberId', description: 'ID thanh vien', format: 'uuid' })
  @ApiOperation({ summary: 'Enroll or re-enroll member face profile' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files', 'consentConfirmed'],
      properties: {
        files: {
          type: 'array',
          minItems: 3,
          maxItems: 5,
          items: { type: 'string', format: 'binary' },
        },
        consentConfirmed: { type: 'boolean', example: true },
      },
    },
  })
  @ApiCreatedResponse({ type: FaceProfileSummaryApiResponseDto })
  @ApiConflictResponse({
    description: 'Face already enrolled by another member in the same family',
    schema: {
      example: {
        success: false,
        message: 'Khuôn mặt này đã được đăng ký cho một thành viên khác.',
        statusCode: 409,
        code: 'FACE_ALREADY_ENROLLED',
        errorCode: 'FACE_ALREADY_ENROLLED',
      },
    },
  })
  @ResponseMessage('Dang ky ho so khuon mat thanh cong')
  enroll(
    @Param('familyId') familyId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentFamilyMember() requester: FamilyMember,
    @Body() _dto: EnrollFaceProfileDto,
    @UploadedFiles() files: UploadedFilePayload[] | undefined,
  ) {
    return this.faceProfiles.enroll(familyId, memberId, requester, files);
  }

  @Post(':memberId/validate')
  @UseInterceptors(
    FilesInterceptor('files', FACE_ENROLLMENT_MAX_FILES, {
      limits: { fileSize: FACE_ENROLLMENT_MAX_FILE_SIZE },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'memberId', description: 'ID thanh vien', format: 'uuid' })
  @ApiOperation({ summary: 'Validate face profile images without saving data' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          minItems: 3,
          maxItems: 5,
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ResponseMessage('Kiem tra anh khuon mat thanh cong')
  validate(
    @Param('familyId') familyId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentFamilyMember() requester: FamilyMember,
    @UploadedFiles() files: UploadedFilePayload[] | undefined,
  ) {
    return this.faceProfiles.validate(familyId, memberId, requester, files);
  }

  @Get(':memberId')
  @ApiParam({ name: 'memberId', description: 'ID thanh vien', format: 'uuid' })
  @ApiOperation({ summary: 'Get face profile status' })
  @ApiOkResponse({ type: FaceProfileSummaryApiResponseDto })
  @ResponseMessage('Lay trang thai ho so khuon mat thanh cong')
  getProfile(
    @Param('familyId') familyId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentFamilyMember() requester: FamilyMember,
  ) {
    return this.faceProfiles.getProfile(familyId, memberId, requester);
  }

  @Patch(':memberId/disable')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'memberId', description: 'ID thanh vien', format: 'uuid' })
  @ApiOperation({ summary: 'Disable face profile' })
  @ApiOkResponse({ type: FaceProfileSummaryApiResponseDto })
  @ResponseMessage('Tat ho so khuon mat thanh cong')
  disable(
    @Param('familyId') familyId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentFamilyMember() requester: FamilyMember,
  ) {
    return this.faceProfiles.disable(familyId, memberId, requester);
  }

  @Patch(':memberId/enable')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'memberId', description: 'ID thanh vien', format: 'uuid' })
  @ApiOperation({ summary: 'Enable face profile' })
  @ApiOkResponse({ type: FaceProfileSummaryApiResponseDto })
  @ResponseMessage('Bat ho so khuon mat thanh cong')
  enable(
    @Param('familyId') familyId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentFamilyMember() requester: FamilyMember,
  ) {
    return this.faceProfiles.enable(familyId, memberId, requester);
  }

  @Delete(':memberId')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'memberId', description: 'ID thanh vien', format: 'uuid' })
  @ApiOperation({ summary: 'Delete biometric face profile data' })
  @ApiOkResponse({ type: FaceProfileSummaryApiResponseDto })
  @ResponseMessage('Xoa du lieu sinh trac hoc thanh cong')
  deleteProfile(
    @Param('familyId') familyId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentFamilyMember() requester: FamilyMember,
    @Body() _dto: DeleteFaceProfileDto,
  ) {
    return this.faceProfiles.deleteProfile(familyId, memberId, requester);
  }
}
