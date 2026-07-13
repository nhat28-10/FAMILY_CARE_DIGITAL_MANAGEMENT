import { ApiProperty } from '@nestjs/swagger';
import {
  FamilyRole,
  MemberStatus,
  TaskProofType,
  TaskSubmissionStatus,
} from '@prisma/client';

export class TaskSubmissionMemberUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Nguyễn Văn A' })
  fullName!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://cdn.example.com/avatar.png',
  })
  avatarUrl!: string | null;
}

export class TaskSubmissionMemberSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ enum: FamilyRole })
  familyRole!: FamilyRole;

  @ApiProperty({ enum: MemberStatus })
  status!: MemberStatus;

  @ApiProperty({ type: () => TaskSubmissionMemberUserResponseDto })
  user!: TaskSubmissionMemberUserResponseDto;
}

export class TaskProofResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  submissionId!: string;

  @ApiProperty({ enum: TaskProofType })
  proofType!: TaskProofType;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://cdn.example.com/proofs/photo.jpg',
  })
  fileUrl!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://cdn.example.com/proofs/photo-thumb.jpg',
  })
  thumbnailUrl!: string | null;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  uploadedAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class TaskSubmissionListItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  assignmentId!: string;

  @ApiProperty({ format: 'uuid' })
  submittedByMemberId!: string;

  @ApiProperty({ type: String, nullable: true })
  submissionNote!: string | null;

  @ApiProperty({ enum: TaskSubmissionStatus })
  status!: TaskSubmissionStatus;

  @ApiProperty({ format: 'uuid', nullable: true })
  reviewedByMemberId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  reviewNote!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  submittedAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  reviewedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;

  @ApiProperty()
  isLate!: boolean;

  @ApiProperty({ example: 2 })
  proofCount!: number;

  @ApiProperty({ type: () => [TaskProofResponseDto] })
  proofs!: TaskProofResponseDto[];

  @ApiProperty({ type: () => TaskSubmissionMemberSummaryResponseDto })
  submittedByMember!: TaskSubmissionMemberSummaryResponseDto;

  @ApiProperty({
    type: () => TaskSubmissionMemberSummaryResponseDto,
    nullable: true,
  })
  reviewedByMember!: TaskSubmissionMemberSummaryResponseDto | null;
}

export class TaskSubmissionPaginatedResponseDto {
  @ApiProperty({ type: () => [TaskSubmissionListItemResponseDto] })
  items!: TaskSubmissionListItemResponseDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;
}

export class TaskSubmissionListApiResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({
    example: 'Lấy danh sách minh chứng hoàn thành công việc thành công',
  })
  message!: string;

  @ApiProperty({ type: () => TaskSubmissionPaginatedResponseDto })
  data!: TaskSubmissionPaginatedResponseDto;
}
