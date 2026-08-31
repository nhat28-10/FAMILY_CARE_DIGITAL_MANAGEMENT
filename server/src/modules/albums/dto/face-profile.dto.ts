import { ApiProperty } from '@nestjs/swagger';
import { FaceProfileStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsString } from 'class-validator';

export class EnrollFaceProfileDto {
  @ApiProperty({ example: true })
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  @Equals(true, { message: 'consentConfirmed must be true' })
  consentConfirmed!: true;
}

export class DeleteFaceProfileDto {
  @ApiProperty({ example: 'DELETE_FACE_PROFILE' })
  @IsString()
  @Equals('DELETE_FACE_PROFILE')
  confirmation!: 'DELETE_FACE_PROFILE';
}

export class FaceProfilePreviewImageResponseDto {
  @ApiProperty({
    example:
      'https://example.r2.cloudflarestorage.com/face-profile-previews/family-id/file.jpg?X-Amz-Signature=...',
  })
  url!: string;

  @ApiProperty({ example: 600 })
  expiresInSeconds!: number;

  @ApiProperty({ example: 'portrait.jpg', nullable: true })
  originalFileName!: string | null;

  @ApiProperty({ example: 'image/jpeg', nullable: true })
  mimeType!: string | null;

  @ApiProperty({ example: 245760, nullable: true })
  fileSize!: number | null;
}

export class FaceProfileSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  memberId!: string;

  @ApiProperty({ enum: FaceProfileStatus, example: FaceProfileStatus.ACTIVE })
  status!: FaceProfileStatus;

  @ApiProperty({
    example: true,
    description:
      'True when the member has an active or disabled face profile with at least the required number of samples.',
  })
  isEnrolled!: boolean;

  @ApiProperty({
    example: 3,
    description:
      'Number of active enrollment samples. This matches the number of accepted face images from the latest enrollment.',
  })
  sampleCount!: number;

  @ApiProperty({
    example: 3,
    description:
      'FE-friendly alias for sampleCount, used to display how many face images were registered.',
  })
  registeredImageCount!: number;

  @ApiProperty({ example: 3 })
  minRequired!: number;

  @ApiProperty({ example: 5 })
  maxAllowed!: number;

  @ApiProperty({
    type: () => FaceProfilePreviewImageResponseDto,
    nullable: true,
    description:
      'Private signed preview URL for the representative enrollment image. Null when the profile has no stored preview image.',
  })
  previewImage!: FaceProfilePreviewImageResponseDto | null;

  @ApiProperty({ example: 'mock-face', nullable: true })
  modelName!: string | null;

  @ApiProperty({ example: 'mock-v1', nullable: true })
  modelVersion!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  consentedAt!: Date | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  createdAt!: Date | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  updatedAt!: Date | null;
}

export class FaceProfileSummaryApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({
    example: 'Lay trang thai ho so khuon mat thanh cong',
  })
  message!: string;

  @ApiProperty({ type: () => FaceProfileSummaryResponseDto })
  data!: FaceProfileSummaryResponseDto;
}
