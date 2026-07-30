import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AlbumFaceDetectionStatus,
  AlbumTagSuggestionStatus,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class RequestFaceScanDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  force?: boolean;
}

class FaceSuggestionPermissionsResponseDto {
  @ApiProperty({ example: true })
  canConfirm!: boolean;

  @ApiProperty({ example: true })
  canReject!: boolean;
}

class FaceSuggestionCandidateResponseDto {
  @ApiProperty({ format: 'uuid' })
  suggestionId!: string;

  @ApiProperty({ format: 'uuid' })
  memberId!: string;

  @ApiProperty({ example: 'Ngo Pham Nhut Duy' })
  displayName!: string;

  @ApiProperty({ example: 'https://example.com/avatar.png', nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({
    example: 0.88,
    minimum: 0,
    maximum: 1,
    description:
      'Similarity score on a 0..1 scale. Backend creates a suggestion only when the candidate passes the configured threshold.',
  })
  score!: number;

  @ApiProperty({
    example: 0.5,
    minimum: 0,
    maximum: 1,
    nullable: true,
    description:
      'Second best score on a 0..1 scale; null when no second candidate exists.',
  })
  secondBestScore!: number | null;

  @ApiProperty({
    example: 0.38,
    nullable: true,
    description:
      'score - secondBestScore. With only one candidate this is equal to score.',
  })
  scoreMargin!: number | null;

  @ApiProperty({ enum: AlbumTagSuggestionStatus, example: 'PENDING' })
  status!: AlbumTagSuggestionStatus;

  @ApiProperty({ type: () => FaceSuggestionPermissionsResponseDto })
  permissions!: FaceSuggestionPermissionsResponseDto;
}

class FaceBoundingBoxResponseDto {
  @ApiProperty({ example: 0.1 })
  x!: number;

  @ApiProperty({ example: 0.2 })
  y!: number;

  @ApiProperty({ example: 0.3 })
  width!: number;

  @ApiProperty({ example: 0.4 })
  height!: number;
}

class DetectedFaceSuggestionResponseDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Stable detection id within the same completed scan job. A force rescan can create new ids.',
  })
  faceId!: string;

  @ApiProperty({ format: 'uuid' })
  detectionId!: string;

  @ApiProperty({
    example: 0,
    description:
      'Zero-based index of the detected face within the scan result; stable only within the same scan job.',
  })
  faceIndex!: number;

  @ApiProperty({ type: () => FaceBoundingBoxResponseDto })
  boundingBox!: FaceBoundingBoxResponseDto;

  @ApiProperty({ example: 0.99, minimum: 0, maximum: 1 })
  detectionScore!: number;

  @ApiProperty({ example: 0.95, nullable: true })
  qualityScore!: number | null;

  @ApiProperty({ enum: AlbumFaceDetectionStatus, example: 'MATCHED' })
  status!: AlbumFaceDetectionStatus;

  @ApiProperty({
    type: () => [FaceSuggestionCandidateResponseDto],
    description:
      'Top candidate suggestions for this detected face. Empty array means the face is detected but unmatched.',
  })
  candidates!: FaceSuggestionCandidateResponseDto[];
}

class FlatSuggestedMemberResponseDto {
  @ApiProperty({ format: 'uuid' })
  memberId!: string;

  @ApiProperty({ example: 'Ngo Pham Nhut Duy' })
  displayName!: string;

  @ApiProperty({ example: 'https://example.com/avatar.png', nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ example: 'FAMILY_MEMBER' })
  familyRole!: string;

  @ApiProperty({ example: 'ACTIVE' })
  memberStatus!: string;
}

class FlatFaceSuggestionItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  suggestionId!: string;

  @ApiProperty({ format: 'uuid' })
  detectionId!: string;

  @ApiProperty({ format: 'uuid' })
  faceId!: string;

  @ApiProperty({ example: 0 })
  faceIndex!: number;

  @ApiProperty({ type: () => FaceBoundingBoxResponseDto })
  boundingBox!: FaceBoundingBoxResponseDto;

  @ApiProperty({ example: 0.88, minimum: 0, maximum: 1 })
  similarityScore!: number;

  @ApiProperty({ example: 0.5, minimum: 0, maximum: 1, nullable: true })
  secondBestScore!: number | null;

  @ApiProperty({ example: 0.38, nullable: true })
  scoreMargin!: number | null;

  @ApiProperty({ enum: AlbumTagSuggestionStatus, example: 'PENDING' })
  status!: AlbumTagSuggestionStatus;

  @ApiProperty({ type: () => FlatSuggestedMemberResponseDto })
  suggestedMember!: FlatSuggestedMemberResponseDto;

  @ApiProperty({ type: () => FaceSuggestionPermissionsResponseDto })
  permissions!: FaceSuggestionPermissionsResponseDto;
}

class FaceSuggestionsDataResponseDto {
  @ApiProperty({
    type: () => [DetectedFaceSuggestionResponseDto],
    description:
      'Canonical response for FE. One item per detected face; each face has zero or more candidates.',
  })
  faces!: DetectedFaceSuggestionResponseDto[];

  @ApiProperty({
    type: () => [FlatFaceSuggestionItemResponseDto],
    description:
      'Backward-compatible flat list of suggestions. Prefer faces[] for multi-face UI.',
  })
  items!: FlatFaceSuggestionItemResponseDto[];

  @ApiProperty({ example: 1, description: 'Number of flat suggestion items.' })
  total!: number;
}

export class FaceSuggestionsApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Lấy danh sách đề xuất tag thành công' })
  message!: string;

  @ApiProperty({ type: () => FaceSuggestionsDataResponseDto })
  data!: FaceSuggestionsDataResponseDto;
}

export const FACE_SUGGESTIONS_RESPONSE_EXAMPLE = {
  success: true,
  message: 'Lấy danh sách đề xuất tag thành công',
  data: {
    faces: [
      {
        faceId: '33333333-3333-4333-8333-333333333333',
        detectionId: '33333333-3333-4333-8333-333333333333',
        faceIndex: 0,
        boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        detectionScore: 0.99,
        qualityScore: 0.95,
        status: 'MATCHED',
        candidates: [
          {
            suggestionId: '22222222-2222-4222-8222-222222222222',
            memberId: 'member-1',
            displayName: 'Ngo Pham Nhut Duy',
            avatarUrl: null,
            score: 0.88,
            secondBestScore: 0.5,
            scoreMargin: 0.38,
            status: 'PENDING',
            permissions: { canConfirm: true, canReject: true },
          },
        ],
      },
      {
        faceId: '44444444-4444-4444-8444-444444444444',
        detectionId: '44444444-4444-4444-8444-444444444444',
        faceIndex: 1,
        boundingBox: { x: 0.55, y: 0.2, width: 0.2, height: 0.3 },
        detectionScore: 0.98,
        qualityScore: null,
        status: 'UNMATCHED',
        candidates: [],
      },
    ],
    items: [
      {
        suggestionId: '22222222-2222-4222-8222-222222222222',
        detectionId: '33333333-3333-4333-8333-333333333333',
        faceId: '33333333-3333-4333-8333-333333333333',
        faceIndex: 0,
        boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        similarityScore: 0.88,
        secondBestScore: 0.5,
        scoreMargin: 0.38,
        status: 'PENDING',
        suggestedMember: {
          memberId: 'member-1',
          displayName: 'Ngo Pham Nhut Duy',
          avatarUrl: null,
          familyRole: 'FAMILY_MEMBER',
          memberStatus: 'ACTIVE',
        },
        permissions: { canConfirm: true, canReject: true },
      },
    ],
    total: 1,
  },
};
