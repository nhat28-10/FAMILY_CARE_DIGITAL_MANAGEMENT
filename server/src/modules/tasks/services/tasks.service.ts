import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FamilyRole,
  MemberStatus,
  Prisma,
  TaskAssignmentStatus,
  TaskCategoryStatus,
  TaskPriority,
  TaskProofType,
  TaskStatus,
  TaskSubmissionStatus,
  TaskType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';

import { withResponseMessage } from '../../../common/types/dynamic-response';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTaskAssignmentDto } from '../dto/create-task-assignment.dto';
import { CreateTaskCategoryDto } from '../dto/create-task-category.dto';
import { CreateTaskSubmissionDto } from '../dto/create-task-submission.dto';
import { CreateTaskDto } from '../dto/create-task.dto';
import { MyTaskAssignmentQueryDto } from '../dto/my-task-assignment-query.dto';
import { ReassignTaskDto } from '../dto/reassign-task.dto';
import {
  ReviewTaskSubmissionDecision,
  ReviewTaskSubmissionDto,
} from '../dto/review-task-submission.dto';
import { TaskAssignmentQueryDto } from '../dto/task-assignment-query.dto';
import { TaskCategoryQueryDto } from '../dto/task-category-query.dto';
import { TaskProofDto } from '../dto/task-proof.dto';
import { TaskQueryDto } from '../dto/task-query.dto';
import { TaskSubmissionQueryDto } from '../dto/task-submission-query.dto';
import { UploadTaskProofQueryDto } from '../dto/upload-task-proof-query.dto';
import { UpdateTaskProofDto } from '../dto/update-task-proof.dto';
import { UpdateTaskCategoryDto } from '../dto/update-task-category.dto';
import { UpdateTaskDto } from '../dto/update-task.dto';

const RECURRING_PHASE_MESSAGE =
  'Công việc lặp lại sẽ được triển khai ở Phase 4';

const ACTIVE_ASSIGNMENT_STATUSES: TaskAssignmentStatus[] = [
  TaskAssignmentStatus.ASSIGNED,
  TaskAssignmentStatus.IN_PROGRESS,
  TaskAssignmentStatus.SUBMITTED,
];

const OVERDUE_ASSIGNMENT_STATUSES: TaskAssignmentStatus[] = [
  TaskAssignmentStatus.ASSIGNED,
  TaskAssignmentStatus.IN_PROGRESS,
  TaskAssignmentStatus.REJECTED,
];

const SUBMITTABLE_ASSIGNMENT_STATUSES: TaskAssignmentStatus[] = [
  TaskAssignmentStatus.ASSIGNED,
  TaskAssignmentStatus.IN_PROGRESS,
  TaskAssignmentStatus.REJECTED,
];

const PROOF_TYPES_REQUIRING_FILE: TaskProofType[] = [
  TaskProofType.IMAGE,
  TaskProofType.VIDEO,
  TaskProofType.FILE,
];

const MAX_TASK_PROOF_FILE_SIZE = 50 * 1024 * 1024;

const SUPPORTED_TASK_PROOF_MIME_TYPES: Record<string, TaskProofType> = {
  'image/jpeg': TaskProofType.IMAGE,
  'image/png': TaskProofType.IMAGE,
  'image/webp': TaskProofType.IMAGE,
  'image/gif': TaskProofType.IMAGE,
  'video/mp4': TaskProofType.VIDEO,
  'video/webm': TaskProofType.VIDEO,
  'video/quicktime': TaskProofType.VIDEO,
  'application/pdf': TaskProofType.FILE,
};

const SAFE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'application/pdf': '.pdf',
};

export interface UploadedTaskProofFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const familyMemberSelect = {
  id: true,
  familyId: true,
  displayName: true,
  familyRole: true,
  relationship: true,
  status: true,
  user: {
    select: {
      id: true,
      email: true,
      fullName: true,
      avatarUrl: true,
    },
  },
} satisfies Prisma.FamilyMemberSelect;

const taskInclude = {
  category: true,
  createdByMember: {
    select: familyMemberSelect,
  },
} satisfies Prisma.TaskInclude;

const assignmentInclude = {
  task: {
    include: {
      category: true,
      createdByMember: {
        select: familyMemberSelect,
      },
    },
  },
  assignedToMember: {
    select: familyMemberSelect,
  },
  assignedByMember: {
    select: familyMemberSelect,
  },
} satisfies Prisma.TaskAssignmentInclude;

const submissionInclude = {
  assignment: {
    include: assignmentInclude,
  },
  submittedByMember: {
    select: familyMemberSelect,
  },
  reviewedByMember: {
    select: familyMemberSelect,
  },
  proofs: {
    orderBy: { uploadedAt: 'asc' },
  },
} satisfies Prisma.TaskSubmissionInclude;

type AssignmentWithRelations = Prisma.TaskAssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

type SubmissionWithRelations = Prisma.TaskSubmissionGetPayload<{
  include: typeof submissionInclude;
}>;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async uploadTaskProofFile(
    familyId: string,
    file: UploadedTaskProofFile | undefined,
    query: UploadTaskProofQueryDto,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file minh chứng');
    }
    if (file.size > MAX_TASK_PROOF_FILE_SIZE) {
      throw new BadRequestException(
        'Dung lượng file minh chứng không được vượt quá 50MB',
      );
    }

    const inferredProofType = SUPPORTED_TASK_PROOF_MIME_TYPES[file.mimetype];
    if (!inferredProofType) {
      throw new BadRequestException(
        'Định dạng file minh chứng không được hỗ trợ',
      );
    }
    if (
      query.proofType &&
      (!PROOF_TYPES_REQUIRING_FILE.includes(query.proofType) ||
        query.proofType !== inferredProofType)
    ) {
      throw new BadRequestException(
        'Định dạng file minh chứng không được hỗ trợ',
      );
    }

    const extension =
      SAFE_EXTENSION_BY_MIME_TYPE[file.mimetype] ||
      extname(file.originalname).toLowerCase();
    const filename = `${randomUUID()}${extension}`;
    const relativeDirectory = ['task-proofs', familyId];
    const uploadDirectory = join(
      process.cwd(),
      'uploads',
      ...relativeDirectory,
    );

    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(join(uploadDirectory, filename), file.buffer);

    return {
      fileUrl: `/uploads/${relativeDirectory.join('/')}/${filename}`,
      thumbnailUrl: null,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      proofType: inferredProofType,
    };
  }

  listTaskCategories(familyId: string, query: TaskCategoryQueryDto) {
    return this.prisma.taskCategory.findMany({
      where: {
        familyId,
        status: query.status,
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  async createTaskCategory(familyId: string, dto: CreateTaskCategoryDto) {
    await this.assertTaskCategoryNameAvailable(familyId, dto.name);

    try {
      return await this.prisma.taskCategory.create({
        data: {
          familyId,
          name: dto.name,
          description: dto.description,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Danh mục công việc đã tồn tại trong gia đình này',
        );
      }
      throw error;
    }
  }

  async updateTaskCategory(
    familyId: string,
    categoryId: string,
    dto: UpdateTaskCategoryDto,
  ) {
    const category = await this.prisma.taskCategory.findFirst({
      where: { id: categoryId, familyId },
    });
    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục công việc');
    }

    if (dto.name && dto.name !== category.name) {
      await this.assertTaskCategoryNameAvailable(
        familyId,
        dto.name,
        categoryId,
      );
    }

    return this.prisma.taskCategory.update({
      where: { id: categoryId },
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status,
      },
    });
  }

  listTasks(familyId: string, query: TaskQueryDto) {
    return this.prisma.task.findMany({
      where: {
        familyId,
        status: query.status,
        taskCategoryId: query.taskCategoryId,
        priority: query.priority,
        taskType: query.taskType,
      },
      include: taskInclude,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getTask(familyId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, familyId },
      include: taskInclude,
    });
    if (!task) {
      throw new NotFoundException('Không tìm thấy công việc');
    }
    return task;
  }

  async createTask(
    familyId: string,
    createdByMemberId: string,
    dto: CreateTaskDto,
  ) {
    this.assertAdHocOnly(dto.taskType);

    if (dto.taskCategoryId) {
      await this.assertActiveCategoryInFamily(familyId, dto.taskCategoryId);
    }

    const task = await this.prisma.task.create({
      data: {
        familyId,
        createdByMemberId,
        taskCategoryId: dto.taskCategoryId,
        title: dto.title,
        description: dto.description,
        taskType: dto.taskType ?? TaskType.AD_HOC,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        status: dto.status ?? TaskStatus.ACTIVE,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
    });

    return this.prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      include: taskInclude,
    });
  }

  async updateTask(familyId: string, taskId: string, dto: UpdateTaskDto) {
    this.assertAdHocOnly(dto.taskType);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, familyId },
    });
    if (!task) {
      throw new NotFoundException('Không tìm thấy công việc');
    }

    if (dto.taskCategoryId) {
      await this.assertActiveCategoryInFamily(familyId, dto.taskCategoryId);
    }

    const taskCategoryIdProvided = Object.hasOwn(dto, 'taskCategoryId');

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        title: dto.title,
        description: dto.description,
        taskCategoryId: taskCategoryIdProvided
          ? (dto.taskCategoryId ?? null)
          : undefined,
        priority: dto.priority,
        status: dto.status,
        dueAt:
          dto.dueAt === undefined
            ? undefined
            : dto.dueAt
              ? new Date(dto.dueAt)
              : null,
      },
      include: taskInclude,
    });
  }

  async cancelTask(familyId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, familyId },
    });
    if (!task) {
      throw new NotFoundException('Không tìm thấy công việc');
    }

    return this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.CANCELED },
      include: taskInclude,
    });
  }

  async createTaskAssignment(
    familyId: string,
    taskId: string,
    assignedByMemberId: string,
    dto: CreateTaskAssignmentDto,
  ) {
    this.assertValidTimeRange(dto.startAt, dto.dueAt);

    const task = await this.findTaskInFamilyOrThrow(familyId, taskId);
    this.assertTaskAssignable(task);
    await this.assertActiveMemberInFamily(familyId, dto.assignedToMemberId);
    await this.assertNoActiveDuplicateAssignment(task, dto.assignedToMemberId);

    const assignment = await this.prisma.taskAssignment.create({
      data: {
        taskId,
        assignedToMemberId: dto.assignedToMemberId,
        assignedByMemberId,
        startAt: dto.startAt ? new Date(dto.startAt) : undefined,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
    });

    const createdAssignment =
      await this.prisma.taskAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
        include: assignmentInclude,
      });
    return this.mapAssignmentResponse(createdAssignment);
  }

  async listTaskAssignments(
    familyId: string,
    taskId: string,
    currentMemberId: string,
    familyRole: FamilyRole,
    query: TaskAssignmentQueryDto,
  ) {
    await this.findTaskInFamilyOrThrow(familyId, taskId);

    const assignments = await this.prisma.taskAssignment.findMany({
      where: {
        taskId,
        status: query.status,
        assignedToMemberId: this.isTaskManager(familyRole)
          ? undefined
          : currentMemberId,
      },
      include: assignmentInclude,
      orderBy: [{ dueAt: 'asc' }, { assignedAt: 'desc' }],
    });
    return assignments.map((assignment) =>
      this.mapAssignmentResponse(assignment),
    );
  }

  async listMyTaskAssignments(
    familyId: string,
    memberId: string,
    query: MyTaskAssignmentQueryDto,
  ) {
    const assignments = await this.prisma.taskAssignment.findMany({
      where: {
        assignedToMemberId: memberId,
        status: query.status,
        startAt: this.buildDateRange(query.startFrom, query.startTo),
        dueAt: this.buildDateRange(query.dueFrom, query.dueTo),
        task: {
          familyId,
          priority: query.priority,
        },
      },
      include: assignmentInclude,
      orderBy: [{ dueAt: 'asc' }, { startAt: 'asc' }, { assignedAt: 'desc' }],
    });
    return assignments.map((assignment) =>
      this.mapAssignmentResponse(assignment),
    );
  }

  async getTaskAssignment(
    familyId: string,
    assignmentId: string,
    currentMemberId: string,
    familyRole: FamilyRole,
  ) {
    const assignment = await this.findAssignmentInFamily(
      familyId,
      assignmentId,
    );
    if (!assignment) {
      throw new NotFoundException('Không tìm thấy phân công công việc');
    }
    this.assertCanViewAssignment(assignment, currentMemberId, familyRole);
    return this.mapAssignmentResponse(assignment);
  }

  async startTaskAssignment(
    familyId: string,
    assignmentId: string,
    currentMemberId: string,
  ) {
    const assignment = await this.findAssignmentInFamily(
      familyId,
      assignmentId,
    );
    if (!assignment) {
      throw new NotFoundException('Không tìm thấy phân công công việc');
    }
    if (assignment.assignedToMemberId !== currentMemberId) {
      throw new ForbiddenException(
        'Bạn không có quyền bắt đầu phân công công việc này',
      );
    }
    if (assignment.status !== TaskAssignmentStatus.ASSIGNED) {
      throw new BadRequestException(
        'Chỉ có thể bắt đầu công việc đang ở trạng thái được giao',
      );
    }

    const updatedAssignment = await this.prisma.taskAssignment.update({
      where: { id: assignmentId },
      data: { status: TaskAssignmentStatus.IN_PROGRESS },
      include: assignmentInclude,
    });
    return this.mapAssignmentResponse(updatedAssignment);
  }

  async cancelTaskAssignment(familyId: string, assignmentId: string) {
    const assignment = await this.findAssignmentInFamily(
      familyId,
      assignmentId,
    );
    if (!assignment) {
      throw new NotFoundException('Không tìm thấy phân công công việc');
    }
    if (assignment.status === TaskAssignmentStatus.APPROVED) {
      throw new BadRequestException(
        'Không thể hủy phân công đã được duyệt hoàn thành',
      );
    }

    const updatedAssignment = await this.prisma.taskAssignment.update({
      where: { id: assignmentId },
      data: { status: TaskAssignmentStatus.CANCELED },
      include: assignmentInclude,
    });
    return this.mapAssignmentResponse(updatedAssignment);
  }

  async reassignTaskAssignment(
    familyId: string,
    assignmentId: string,
    assignedByMemberId: string,
    dto: ReassignTaskDto,
  ) {
    this.assertValidTimeRange(dto.startAt, dto.dueAt);

    const assignment = await this.findAssignmentInFamily(
      familyId,
      assignmentId,
    );
    if (!assignment) {
      throw new NotFoundException('Không tìm thấy phân công công việc');
    }
    if (assignment.status === TaskAssignmentStatus.APPROVED) {
      throw new BadRequestException(
        'Không thể giao lại công việc đã được duyệt hoàn thành',
      );
    }

    await this.assertActiveMemberInFamily(familyId, dto.assignedToMemberId);
    await this.assertNoActiveDuplicateAssignment(
      assignment.task,
      dto.assignedToMemberId,
      assignmentId,
    );

    const updatedAssignment = await this.prisma.taskAssignment.update({
      where: { id: assignmentId },
      data: {
        assignedToMemberId: dto.assignedToMemberId,
        assignedByMemberId,
        assignedAt: new Date(),
        startAt: dto.startAt ? new Date(dto.startAt) : null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        status: TaskAssignmentStatus.ASSIGNED,
      },
      include: assignmentInclude,
    });
    return this.mapAssignmentResponse(updatedAssignment);
  }

  async createTaskSubmission(
    familyId: string,
    assignmentId: string,
    memberId: string,
    dto: CreateTaskSubmissionDto,
  ) {
    this.assertValidSubmissionProofs(dto.proofs);

    const submission = await this.prisma.$transaction(async (tx) => {
      const assignment = await tx.taskAssignment.findFirst({
        where: { id: assignmentId, task: { familyId } },
        include: { task: true },
      });
      if (!assignment) {
        throw new NotFoundException('Không tìm thấy phân công công việc');
      }
      if (assignment.assignedToMemberId !== memberId) {
        throw new ForbiddenException(
          'Bạn không có quyền nộp minh chứng cho công việc này',
        );
      }
      if (!SUBMITTABLE_ASSIGNMENT_STATUSES.includes(assignment.status)) {
        throw new BadRequestException(
          'Trạng thái phân công hiện tại không cho phép nộp minh chứng',
        );
      }

      const createdSubmission = await tx.taskSubmission.create({
        data: {
          assignmentId,
          submittedByMemberId: memberId,
          submissionNote: dto.submissionNote,
          proofs: {
            create: dto.proofs.map((proof) => ({
              proofType: proof.proofType,
              fileUrl: proof.fileUrl,
              thumbnailUrl: proof.thumbnailUrl,
              note: proof.note,
            })),
          },
        },
      });

      await tx.taskAssignment.update({
        where: { id: assignmentId },
        data: { status: TaskAssignmentStatus.SUBMITTED },
      });

      return tx.taskSubmission.findUniqueOrThrow({
        where: { id: createdSubmission.id },
        include: submissionInclude,
      });
    });

    return this.mapSubmissionResponse(submission);
  }

  async updateTaskProof(
    familyId: string,
    proofId: string,
    memberId: string,
    dto: UpdateTaskProofDto,
  ) {
    const proof = await this.findProofInFamily(familyId, proofId);
    if (!proof) {
      throw new NotFoundException('Không tìm thấy minh chứng');
    }
    if (proof.submission.submittedByMemberId !== memberId) {
      throw new ForbiddenException(
        'Bạn không có quyền chỉnh sửa minh chứng này',
      );
    }
    if (proof.submission.status !== TaskSubmissionStatus.WAITING_REVIEW) {
      throw new BadRequestException(
        'Chỉ được chỉnh sửa minh chứng đang chờ xem xét',
      );
    }

    this.assertValidProofPayload({
      proofType: dto.proofType ?? proof.proofType,
      fileUrl: dto.fileUrl ?? proof.fileUrl,
      note: dto.note ?? proof.note,
    });

    return this.prisma.taskProof.update({
      where: { id: proofId },
      data: {
        proofType: dto.proofType,
        fileUrl: dto.fileUrl,
        thumbnailUrl: dto.thumbnailUrl,
        note: dto.note,
      },
    });
  }

  async deleteTaskProof(familyId: string, proofId: string, memberId: string) {
    const proof = await this.findProofInFamily(familyId, proofId);
    if (!proof) {
      throw new NotFoundException('Không tìm thấy minh chứng');
    }
    if (proof.submission.submittedByMemberId !== memberId) {
      throw new ForbiddenException('Bạn không có quyền xóa minh chứng này');
    }
    if (proof.submission.status !== TaskSubmissionStatus.WAITING_REVIEW) {
      throw new BadRequestException('Chỉ được xóa minh chứng đang chờ xem xét');
    }
    if (proof.submission._count.proofs <= 1) {
      throw new BadRequestException(
        'Cần có ít nhất một minh chứng hoàn thành công việc',
      );
    }

    return this.prisma.taskProof.delete({ where: { id: proofId } });
  }

  async listTaskSubmissions(
    familyId: string,
    assignmentId: string,
    memberId: string,
    familyRole: FamilyRole,
    query: TaskSubmissionQueryDto,
  ) {
    const assignment = await this.findAssignmentInFamily(
      familyId,
      assignmentId,
    );
    if (!assignment) {
      throw new NotFoundException('Không tìm thấy phân công công việc');
    }
    this.assertCanViewAssignment(assignment, memberId, familyRole);

    const submissions = await this.prisma.taskSubmission.findMany({
      where: {
        assignmentId,
        status: query.status,
      },
      include: submissionInclude,
      orderBy: { submittedAt: 'desc' },
    });

    return submissions.map((submission) =>
      this.mapSubmissionResponse(submission),
    );
  }

  async getTaskSubmission(
    familyId: string,
    submissionId: string,
    memberId: string,
    familyRole: FamilyRole,
  ) {
    const submission = await this.findSubmissionInFamily(
      familyId,
      submissionId,
    );
    if (!submission) {
      throw new NotFoundException(
        'Không tìm thấy minh chứng hoàn thành công việc',
      );
    }
    this.assertCanViewSubmission(submission, memberId, familyRole);
    return this.mapSubmissionResponse(submission);
  }

  async reviewTaskSubmission(
    familyId: string,
    submissionId: string,
    reviewerMemberId: string,
    dto: ReviewTaskSubmissionDto,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const submission = await tx.taskSubmission.findFirst({
        where: {
          id: submissionId,
          assignment: { task: { familyId } },
        },
        include: {
          assignment: {
            include: { task: true },
          },
        },
      });
      if (!submission) {
        throw new NotFoundException(
          'Không tìm thấy minh chứng hoàn thành công việc',
        );
      }
      if (submission.status !== TaskSubmissionStatus.WAITING_REVIEW) {
        throw new BadRequestException(
          'Chỉ có thể duyệt minh chứng đang chờ xem xét',
        );
      }

      const nextSubmissionStatus =
        dto.decision === ReviewTaskSubmissionDecision.APPROVED
          ? TaskSubmissionStatus.APPROVED
          : dto.decision === ReviewTaskSubmissionDecision.REJECTED
            ? TaskSubmissionStatus.REJECTED
            : undefined;
      if (!nextSubmissionStatus) {
        throw new BadRequestException('Quyết định duyệt không hợp lệ');
      }

      const nextAssignmentStatus =
        dto.decision === ReviewTaskSubmissionDecision.APPROVED
          ? TaskAssignmentStatus.APPROVED
          : TaskAssignmentStatus.REJECTED;

      const reviewedSubmission = await tx.taskSubmission.update({
        where: { id: submissionId },
        data: {
          status: nextSubmissionStatus,
          reviewedByMemberId: reviewerMemberId,
          reviewNote: dto.reviewNote,
          reviewedAt: new Date(),
        },
      });

      await tx.taskAssignment.update({
        where: { id: submission.assignmentId },
        data: { status: nextAssignmentStatus },
      });

      if (dto.decision === ReviewTaskSubmissionDecision.APPROVED) {
        const remainingNotApproved = await tx.taskAssignment.count({
          where: {
            taskId: submission.assignment.taskId,
            status: {
              notIn: [
                TaskAssignmentStatus.CANCELED,
                TaskAssignmentStatus.APPROVED,
              ],
            },
          },
        });
        if (remainingNotApproved === 0) {
          await tx.task.update({
            where: { id: submission.assignment.taskId },
            data: { status: TaskStatus.COMPLETED },
          });
        }
      } else {
        await tx.task.update({
          where: { id: submission.assignment.taskId },
          data: { status: TaskStatus.ACTIVE },
        });
      }

      return tx.taskSubmission.findUniqueOrThrow({
        where: { id: reviewedSubmission.id },
        include: submissionInclude,
      });
    });

    return withResponseMessage(
      dto.decision === ReviewTaskSubmissionDecision.APPROVED
        ? 'Duyệt hoàn thành công việc thành công'
        : 'Từ chối hoàn thành công việc thành công',
      this.mapSubmissionResponse(result),
    );
  }

  private async assertTaskCategoryNameAvailable(
    familyId: string,
    name: string,
    excludeCategoryId?: string,
  ) {
    const duplicate = await this.prisma.taskCategory.findFirst({
      where: {
        familyId,
        name,
        id: excludeCategoryId ? { not: excludeCategoryId } : undefined,
      },
    });
    if (duplicate) {
      throw new ConflictException(
        'Danh mục công việc đã tồn tại trong gia đình này',
      );
    }
  }

  private async assertActiveCategoryInFamily(
    familyId: string,
    categoryId: string,
  ) {
    const category = await this.prisma.taskCategory.findFirst({
      where: {
        id: categoryId,
        familyId,
        status: TaskCategoryStatus.ACTIVE,
      },
    });
    if (!category) {
      throw new BadRequestException(
        'Danh mục công việc không hợp lệ hoặc đã ngừng hoạt động',
      );
    }
  }

  private assertAdHocOnly(taskType?: TaskType) {
    if (taskType === TaskType.RECURRING) {
      throw new BadRequestException(RECURRING_PHASE_MESSAGE);
    }
  }

  private async findTaskInFamilyOrThrow(familyId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, familyId },
    });
    if (!task) {
      throw new NotFoundException('Không tìm thấy công việc');
    }
    return task;
  }

  private findAssignmentInFamily(familyId: string, assignmentId: string) {
    return this.prisma.taskAssignment.findFirst({
      where: {
        id: assignmentId,
        task: { familyId },
      },
      include: assignmentInclude,
    });
  }

  private findSubmissionInFamily(familyId: string, submissionId: string) {
    return this.prisma.taskSubmission.findFirst({
      where: {
        id: submissionId,
        assignment: { task: { familyId } },
      },
      include: submissionInclude,
    });
  }

  private findProofInFamily(familyId: string, proofId: string) {
    return this.prisma.taskProof.findFirst({
      where: {
        id: proofId,
        submission: {
          assignment: { task: { familyId } },
        },
      },
      include: {
        submission: {
          include: {
            assignment: {
              include: { task: true },
            },
            _count: {
              select: { proofs: true },
            },
          },
        },
      },
    });
  }

  private assertTaskAssignable(task: {
    taskType: TaskType;
    status: TaskStatus;
  }) {
    if (task.taskType === TaskType.RECURRING) {
      throw new BadRequestException(RECURRING_PHASE_MESSAGE);
    }
    if (
      task.status === TaskStatus.CANCELED ||
      task.status === TaskStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'Không thể giao công việc đã bị hủy hoặc đã hoàn thành',
      );
    }
  }

  private async assertActiveMemberInFamily(familyId: string, memberId: string) {
    const member = await this.prisma.familyMember.findFirst({
      where: {
        id: memberId,
        familyId,
        status: MemberStatus.ACTIVE,
      },
    });
    if (!member) {
      throw new BadRequestException(
        'Thành viên được giao không hợp lệ hoặc không thuộc gia đình này',
      );
    }
  }

  private async assertNoActiveDuplicateAssignment(
    task: { id: string; taskType: TaskType },
    assignedToMemberId: string,
    excludeAssignmentId?: string,
  ) {
    if (task.taskType !== TaskType.AD_HOC) {
      return;
    }

    const duplicate = await this.prisma.taskAssignment.findFirst({
      where: {
        taskId: task.id,
        assignedToMemberId,
        status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
        id: excludeAssignmentId ? { not: excludeAssignmentId } : undefined,
      },
    });
    if (duplicate) {
      throw new ConflictException('Thành viên này đã được giao công việc này');
    }
  }

  private assertValidTimeRange(startAt?: string, dueAt?: string) {
    if (!startAt || !dueAt) {
      return;
    }

    if (new Date(dueAt).getTime() <= new Date(startAt).getTime()) {
      throw new BadRequestException(
        'Thời gian kết thúc phải sau thời gian bắt đầu',
      );
    }
  }

  private buildDateRange(from?: string, to?: string) {
    if (!from && !to) {
      return undefined;
    }

    return {
      gte: from ? new Date(from) : undefined,
      lte: to ? new Date(to) : undefined,
    };
  }

  private assertCanViewAssignment(
    assignment: { assignedToMemberId: string },
    currentMemberId: string,
    familyRole: FamilyRole,
  ) {
    if (
      !this.isTaskManager(familyRole) &&
      assignment.assignedToMemberId !== currentMemberId
    ) {
      throw new ForbiddenException(
        'Bạn không có quyền xem phân công công việc này',
      );
    }
  }

  private assertCanViewSubmission(
    submission: { assignment: { assignedToMemberId: string } },
    currentMemberId: string,
    familyRole: FamilyRole,
  ) {
    if (
      !this.isTaskManager(familyRole) &&
      submission.assignment.assignedToMemberId !== currentMemberId
    ) {
      throw new ForbiddenException('Bạn không có quyền xem minh chứng này');
    }
  }

  private assertValidSubmissionProofs(proofs?: TaskProofDto[]) {
    if (!proofs || proofs.length === 0) {
      throw new BadRequestException(
        'Cần có ít nhất một minh chứng hoàn thành công việc',
      );
    }

    for (const proof of proofs) {
      this.assertValidProofPayload(proof);
    }
  }

  private assertValidProofPayload(proof: {
    proofType?: TaskProofType;
    fileUrl?: string | null;
    note?: string | null;
  }) {
    if (proof.proofType === TaskProofType.NOTE && !proof.note?.trim()) {
      throw new BadRequestException(
        'Nội dung ghi chú minh chứng không được để trống',
      );
    }

    if (
      proof.proofType &&
      PROOF_TYPES_REQUIRING_FILE.includes(proof.proofType) &&
      !proof.fileUrl?.trim()
    ) {
      throw new BadRequestException(
        'Đường dẫn file minh chứng không được để trống',
      );
    }
  }

  private mapAssignmentResponse<T extends AssignmentWithRelations>(
    assignment: T,
  ) {
    return {
      ...assignment,
      isOverdue: this.isAssignmentOverdue(assignment),
    };
  }

  private mapSubmissionResponse<T extends SubmissionWithRelations>(
    submission: T,
  ) {
    return {
      ...submission,
      assignment: this.mapAssignmentResponse(submission.assignment),
      isLate: this.isSubmissionLate(submission),
    };
  }

  private isAssignmentOverdue(assignment: {
    dueAt: Date | null;
    status: TaskAssignmentStatus;
  }) {
    return Boolean(
      assignment.dueAt &&
      new Date().getTime() > assignment.dueAt.getTime() &&
      OVERDUE_ASSIGNMENT_STATUSES.includes(assignment.status),
    );
  }

  private isSubmissionLate(submission: {
    submittedAt: Date;
    assignment: { dueAt: Date | null };
  }) {
    return Boolean(
      submission.assignment.dueAt &&
      submission.submittedAt.getTime() > submission.assignment.dueAt.getTime(),
    );
  }

  private isTaskManager(familyRole: FamilyRole) {
    const managerRoles: FamilyRole[] = [
      FamilyRole.FAMILY_MANAGER,
      FamilyRole.DEPUTY_MEMBER,
    ];
    return managerRoles.includes(familyRole);
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
