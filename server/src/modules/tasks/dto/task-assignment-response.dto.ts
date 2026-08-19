import { ApiProperty } from '@nestjs/swagger';
import {
  FamilyRole,
  MemberStatus,
  TaskAssignmentStatus,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '@prisma/client';

class TaskAssignmentUserSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Nguyen Van A', nullable: true })
  fullName!: string | null;

  @ApiProperty({ example: 'https://example.com/avatar.jpg', nullable: true })
  avatarUrl!: string | null;
}

class TaskAssignmentMemberSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ enum: FamilyRole })
  familyRole!: FamilyRole;

  @ApiProperty({ enum: MemberStatus })
  status!: MemberStatus;

  @ApiProperty({ type: () => TaskAssignmentUserSummaryResponseDto })
  user!: TaskAssignmentUserSummaryResponseDto;
}

class TaskAssignmentCategorySummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Housework' })
  name!: string;
}

class TaskAssignmentTaskSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  familyId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  taskCategoryId!: string | null;

  @ApiProperty({ example: 'Wash dishes' })
  title!: string;

  @ApiProperty({ enum: TaskType })
  taskType!: TaskType;

  @ApiProperty({ enum: TaskPriority })
  priority!: TaskPriority;

  @ApiProperty({ enum: TaskStatus })
  status!: TaskStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dueAt!: string | null;

  @ApiProperty({
    type: () => TaskAssignmentCategorySummaryResponseDto,
    nullable: true,
  })
  category!: TaskAssignmentCategorySummaryResponseDto | null;
}

export class TaskAssignmentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  taskId!: string;

  @ApiProperty({ format: 'uuid' })
  assignedToMemberId!: string;

  @ApiProperty({ format: 'uuid' })
  assignedByMemberId!: string;

  @ApiProperty({ enum: TaskAssignmentStatus })
  status!: TaskAssignmentStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  assignedAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dueAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;

  @ApiProperty()
  isOverdue!: boolean;

  @ApiProperty({
    type: () => TaskAssignmentMemberSummaryResponseDto,
    nullable: true,
  })
  assignedToMember!: TaskAssignmentMemberSummaryResponseDto | null;

  @ApiProperty({
    type: () => TaskAssignmentMemberSummaryResponseDto,
    nullable: true,
  })
  assignedByMember!: TaskAssignmentMemberSummaryResponseDto | null;

  @ApiProperty({
    type: () => TaskAssignmentTaskSummaryResponseDto,
    required: false,
  })
  task?: TaskAssignmentTaskSummaryResponseDto;
}

export class TaskAssignmentApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Lay chi tiet phan cong cong viec thanh cong' })
  message!: string;

  @ApiProperty({ type: () => TaskAssignmentResponseDto })
  data!: TaskAssignmentResponseDto;
}

class TaskAssignmentListDataResponseDto {
  @ApiProperty({ type: () => [TaskAssignmentResponseDto] })
  items!: TaskAssignmentResponseDto[];

  @ApiProperty({ example: 1 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;
}

export class TaskAssignmentListApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Lay danh sach phan cong cong viec thanh cong' })
  message!: string;

  @ApiProperty({ type: () => TaskAssignmentListDataResponseDto })
  data!: TaskAssignmentListDataResponseDto;
}
