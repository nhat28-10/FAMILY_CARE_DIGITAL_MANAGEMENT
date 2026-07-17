import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  FinanceLedgerStatus,
  FinancialGoalStatus,
  FamilyRole,
  LedgerEntryStatus,
  LedgerEntryType,
  MemberStatus,
  NotificationPriority,
  NotificationType,
  Prisma,
  RewardDisputeStatus,
  RewardSettlementStatus,
  RewardType,
  TaskAssignmentStatus,
  TaskCategoryStatus,
  TaskPriority,
  TaskProofType,
  TaskRepeatType,
  TaskScheduleStatus,
  TaskStatus,
  TaskSubmissionStatus,
  TaskType,
  TaskUnavailabilityStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';

import { withResponseMessage } from '../../../common/types/dynamic-response';
import {
  buildPaginated,
  skipFor,
} from '../../../common/types/paginated-result';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { CreateTaskAssignmentDto } from '../dto/create-task-assignment.dto';
import { CreateTaskCategoryDto } from '../dto/create-task-category.dto';
import { CreateRecurringTaskDto } from '../dto/create-recurring-task.dto';
import { CreateRewardAllocationDto } from '../dto/create-reward-allocation.dto';
import { CreateRewardDisputeDto } from '../dto/create-reward-dispute.dto';
import { CreateRewardSettingDto } from '../dto/create-reward-setting.dto';
import { CreateTaskSubmissionDto } from '../dto/create-task-submission.dto';
import { CreateTaskDto } from '../dto/create-task.dto';
import { GenerateTaskAssignmentsDto } from '../dto/generate-task-assignments.dto';
import {
  HandleTaskUnavailabilityAction,
  HandleTaskUnavailabilityDto,
} from '../dto/handle-task-unavailability.dto';
import { MyTaskAssignmentQueryDto } from '../dto/my-task-assignment-query.dto';
import { QueryRewardDisputeDto } from '../dto/query-reward-dispute.dto';
import { QueryTaskUnavailabilityDto } from '../dto/query-task-unavailability.dto';
import { ReassignTaskDto } from '../dto/reassign-task.dto';
import { ReportTaskUnavailabilityDto } from '../dto/report-task-unavailability.dto';
import {
  ResolveRewardDisputeAction,
  ResolveRewardDisputeDto,
} from '../dto/resolve-reward-dispute.dto';
import { MarkRewardPaidDto } from '../dto/mark-reward-paid.dto';
import { RewardSettlementQueryDto } from '../dto/reward-settlement-query.dto';
import {
  ReviewTaskSubmissionDecision,
  ReviewTaskSubmissionDto,
} from '../dto/review-task-submission.dto';
import { TaskScheduleDto } from '../dto/task-schedule.dto';
import { TaskAssignmentQueryDto } from '../dto/task-assignment-query.dto';
import { TaskCategoryQueryDto } from '../dto/task-category-query.dto';
import { TaskProofDto } from '../dto/task-proof.dto';
import { TaskQueryDto } from '../dto/task-query.dto';
import { TaskSubmissionQueryDto } from '../dto/task-submission-query.dto';
import { UploadTaskProofQueryDto } from '../dto/upload-task-proof-query.dto';
import { UpdateTaskProofDto } from '../dto/update-task-proof.dto';
import { UpdateRewardSettingDto } from '../dto/update-reward-setting.dto';
import { UpdateTaskScheduleDto } from '../dto/update-task-schedule.dto';
import { UpdateTaskCategoryDto } from '../dto/update-task-category.dto';
import { UpdateTaskDto } from '../dto/update-task.dto';

const RECURRING_PHASE_MESSAGE =
  'Vui lòng tạo công việc lặp lại bằng API lịch lặp';

const RECURRING_ASSIGNMENT_MESSAGE =
  'Vui lòng sinh phân công cho công việc lặp lại bằng API lịch lặp';

const VIETNAM_TIME_ZONE_OFFSET_MINUTES = 7 * 60;

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

const memberSummarySelect = {
  id: true,
  userId: true,
  familyRole: true,
  status: true,
  user: {
    select: {
      id: true,
      fullName: true,
      avatarUrl: true,
    },
  },
} satisfies Prisma.FamilyMemberSelect;

const memberCompactSummarySelect = {
  id: true,
  userId: true,
  user: {
    select: {
      id: true,
      fullName: true,
      avatarUrl: true,
    },
  },
} satisfies Prisma.FamilyMemberSelect;

const unavailabilityMemberSelect = {
  id: true,
  userId: true,
  displayName: true,
  familyRole: true,
  user: {
    select: {
      id: true,
      fullName: true,
      avatarUrl: true,
    },
  },
} satisfies Prisma.FamilyMemberSelect;

const categoryResponseSelect = {
  id: true,
  familyId: true,
  name: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TaskCategorySelect;

const categorySummarySelect = {
  id: true,
  name: true,
  status: true,
} satisfies Prisma.TaskCategorySelect;

const taskScheduleResponseSelect = {
  id: true,
  taskId: true,
  repeatType: true,
  repeatInterval: true,
  startDate: true,
  endDate: true,
  dayOfWeek: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TaskScheduleSelect;

const taskResponseSelect = {
  id: true,
  familyId: true,
  taskCategoryId: true,
  title: true,
  description: true,
  taskType: true,
  priority: true,
  status: true,
  createdByMemberId: true,
  dueAt: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: categoryResponseSelect,
  },
  createdByMember: {
    select: memberSummarySelect,
  },
  schedule: {
    select: taskScheduleResponseSelect,
  },
} satisfies Prisma.TaskSelect;

const taskListItemSelect = {
  id: true,
  familyId: true,
  taskCategoryId: true,
  title: true,
  description: true,
  taskType: true,
  priority: true,
  status: true,
  createdByMemberId: true,
  dueAt: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: categorySummarySelect,
  },
  createdByMember: {
    select: memberCompactSummarySelect,
  },
} satisfies Prisma.TaskSelect;

const taskSummarySelect = {
  id: true,
  familyId: true,
  taskCategoryId: true,
  title: true,
  taskType: true,
  priority: true,
  status: true,
  dueAt: true,
  category: {
    select: categorySummarySelect,
  },
} satisfies Prisma.TaskSelect;

const assignmentResponseSelect = {
  id: true,
  taskId: true,
  assignedToMemberId: true,
  assignedByMemberId: true,
  status: true,
  assignedAt: true,
  startAt: true,
  dueAt: true,
  createdAt: true,
  updatedAt: true,
  assignedToMember: {
    select: memberSummarySelect,
  },
  assignedByMember: {
    select: memberSummarySelect,
  },
} satisfies Prisma.TaskAssignmentSelect;

const assignmentWithTaskResponseSelect = {
  ...assignmentResponseSelect,
  task: {
    select: taskSummarySelect,
  },
} satisfies Prisma.TaskAssignmentSelect;

const taskUnavailabilityResponseSelect = {
  id: true,
  assignmentId: true,
  reportedByMemberId: true,
  reason: true,
  status: true,
  reportedAt: true,
  handledByMemberId: true,
  handledAt: true,
  reportedByMember: {
    select: unavailabilityMemberSelect,
  },
  handledByMember: {
    select: unavailabilityMemberSelect,
  },
  assignment: {
    select: {
      id: true,
      status: true,
      assignedAt: true,
      startAt: true,
      dueAt: true,
      assignedToMember: {
        select: unavailabilityMemberSelect,
      },
      task: {
        select: {
          id: true,
          title: true,
          taskType: true,
          priority: true,
          status: true,
        },
      },
    },
  },
} satisfies Prisma.TaskUnavailabilitySelect;

const rewardSettingResponseSelect = {
  id: true,
  taskId: true,
  rewardType: true,
  rewardAmount: true,
  rewardDescription: true,
  autoCreateSettlement: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RewardSettingSelect;

const rewardSettlementResponseSelect = {
  id: true,
  taskSubmissionId: true,
  rewardSettingId: true,
  receiverMemberId: true,
  settledByMemberId: true,
  amount: true,
  status: true,
  externalMethod: true,
  externalNote: true,
  settledAt: true,
  confirmedAt: true,
  createdAt: true,
  updatedAt: true,
  receiverMember: {
    select: unavailabilityMemberSelect,
  },
  settledByMember: {
    select: unavailabilityMemberSelect,
  },
  taskSubmission: {
    select: {
      id: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
      assignment: {
        select: {
          task: {
            select: {
              id: true,
              title: true,
              taskType: true,
              priority: true,
              status: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.RewardSettlementSelect;

const rewardAllocationResponseSelect = {
  id: true,
  rewardSettlementId: true,
  jarId: true,
  goalId: true,
  ledgerEntryId: true,
  amount: true,
  allocatedByMemberId: true,
  allocatedAt: true,
  jar: {
    select: {
      id: true,
      name: true,
    },
  },
  goal: {
    select: {
      id: true,
      goalName: true,
    },
  },
  allocatedByMember: {
    select: unavailabilityMemberSelect,
  },
} satisfies Prisma.RewardAllocationSelect;

const rewardDisputeResponseSelect = {
  id: true,
  rewardSettlementId: true,
  reportedByMemberId: true,
  reason: true,
  status: true,
  resolvedByMemberId: true,
  createdAt: true,
  resolvedAt: true,
  reportedByMember: {
    select: unavailabilityMemberSelect,
  },
  resolvedByMember: {
    select: unavailabilityMemberSelect,
  },
  rewardSettlement: {
    select: {
      id: true,
      amount: true,
      status: true,
      externalMethod: true,
      settledAt: true,
      confirmedAt: true,
      receiverMemberId: true,
      taskSubmission: {
        select: {
          assignment: {
            select: {
              task: {
                select: {
                  familyId: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.RewardDisputeSelect;

const proofResponseSelect = {
  id: true,
  submissionId: true,
  proofType: true,
  fileUrl: true,
  thumbnailUrl: true,
  note: true,
  uploadedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TaskProofSelect;

const submissionResponseSelect = {
  id: true,
  assignmentId: true,
  submittedByMemberId: true,
  submissionNote: true,
  status: true,
  reviewedByMemberId: true,
  reviewNote: true,
  submittedAt: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  assignment: {
    select: {
      assignedToMemberId: true,
      dueAt: true,
    },
  },
  submittedByMember: {
    select: memberSummarySelect,
  },
  reviewedByMember: {
    select: memberSummarySelect,
  },
  proofs: {
    select: proofResponseSelect,
    orderBy: { uploadedAt: 'asc' },
  },
} satisfies Prisma.TaskSubmissionSelect;

const submissionListItemSelect = {
  id: true,
  assignmentId: true,
  submittedByMemberId: true,
  submissionNote: true,
  status: true,
  reviewedByMemberId: true,
  reviewNote: true,
  submittedAt: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  assignment: {
    select: {
      assignedToMemberId: true,
      dueAt: true,
    },
  },
  submittedByMember: {
    select: memberSummarySelect,
  },
  reviewedByMember: {
    select: memberSummarySelect,
  },
  proofs: {
    select: proofResponseSelect,
    orderBy: { uploadedAt: 'asc' },
  },
  _count: {
    select: {
      proofs: true,
    },
  },
} satisfies Prisma.TaskSubmissionSelect;

type MemberSummaryPayload = Prisma.FamilyMemberGetPayload<{
  select: typeof memberSummarySelect;
}>;

type MemberCompactSummaryPayload = Prisma.FamilyMemberGetPayload<{
  select: typeof memberCompactSummarySelect;
}>;

type UnavailabilityMemberPayload = Prisma.FamilyMemberGetPayload<{
  select: typeof unavailabilityMemberSelect;
}>;

type CategoryResponsePayload = Prisma.TaskCategoryGetPayload<{
  select: typeof categoryResponseSelect;
}>;

type CategorySummaryPayload = Prisma.TaskCategoryGetPayload<{
  select: typeof categorySummarySelect;
}>;

type TaskScheduleResponsePayload = Prisma.TaskScheduleGetPayload<{
  select: typeof taskScheduleResponseSelect;
}>;

type TaskResponsePayload = Prisma.TaskGetPayload<{
  select: typeof taskResponseSelect;
}>;

type TaskListItemPayload = Prisma.TaskGetPayload<{
  select: typeof taskListItemSelect;
}>;

type TaskSummaryPayload = Prisma.TaskGetPayload<{
  select: typeof taskSummarySelect;
}>;

type AssignmentResponsePayload = Prisma.TaskAssignmentGetPayload<{
  select: typeof assignmentResponseSelect;
}>;

type AssignmentWithTaskResponsePayload = Prisma.TaskAssignmentGetPayload<{
  select: typeof assignmentWithTaskResponseSelect;
}>;

type TaskUnavailabilityResponsePayload = Prisma.TaskUnavailabilityGetPayload<{
  select: typeof taskUnavailabilityResponseSelect;
}>;

type RewardSettingResponsePayload = Prisma.RewardSettingGetPayload<{
  select: typeof rewardSettingResponseSelect;
}>;

type RewardSettlementResponsePayload = Prisma.RewardSettlementGetPayload<{
  select: typeof rewardSettlementResponseSelect;
}>;

type RewardAllocationResponsePayload = Prisma.RewardAllocationGetPayload<{
  select: typeof rewardAllocationResponseSelect;
}>;

type RewardDisputeResponsePayload = Prisma.RewardDisputeGetPayload<{
  select: typeof rewardDisputeResponseSelect;
}>;

type SubmissionResponsePayload = Prisma.TaskSubmissionGetPayload<{
  select: typeof submissionResponseSelect;
}>;

type SubmissionListItemPayload = Prisma.TaskSubmissionGetPayload<{
  select: typeof submissionListItemSelect;
}>;

type ProofResponsePayload = Prisma.TaskProofGetPayload<{
  select: typeof proofResponseSelect;
}>;

type TaskScheduleValidationInput = {
  repeatType: TaskRepeatType;
  repeatInterval: number;
  startDate: string | Date;
  endDate?: string | Date | null;
  dayOfWeek?: number | null;
  status?: TaskScheduleStatus;
};

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly storage?: StorageService,
  ) { }

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

  async listTaskCategories(familyId: string, query: TaskCategoryQueryDto) {
    const where: Prisma.TaskCategoryWhereInput = {
      familyId,
      status: query.status,
    };

    const [categories, total] = await this.prisma.$transaction([
      this.prisma.taskCategory.findMany({
        where,
        select: categorySummarySelect,
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        skip: skipFor(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.taskCategory.count({ where }),
    ]);

    return buildPaginated(
      categories.map((category) => this.mapCategorySummary(category)),
      total,
      query.page,
      query.limit,
    );
  }

  async createTaskCategory(familyId: string, dto: CreateTaskCategoryDto) {
    await this.assertTaskCategoryNameAvailable(familyId, dto.name);

    try {
      const category = await this.prisma.taskCategory.create({
        data: {
          familyId,
          name: dto.name,
          description: dto.description,
        },
        select: categoryResponseSelect,
      });
      return this.mapCategoryResponse(category);
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

    const updatedCategory = await this.prisma.taskCategory.update({
      where: { id: categoryId },
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status,
      },
      select: categoryResponseSelect,
    });
    return this.mapCategoryResponse(updatedCategory);
  }

  async listTasks(familyId: string, query: TaskQueryDto) {
    const where: Prisma.TaskWhereInput = {
      familyId,
      status: query.status,
      taskCategoryId: query.taskCategoryId,
      priority: query.priority,
      taskType: query.taskType,
    };

    const [tasks, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        select: taskListItemSelect,
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        skip: skipFor(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    return buildPaginated(
      tasks.map((task) => this.mapTaskListItem(task)),
      total,
      query.page,
      query.limit,
    );
  }

  async getTask(familyId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, familyId },
      select: taskResponseSelect,
    });
    if (!task) {
      throw new NotFoundException('Không tìm thấy công việc');
    }
    return this.mapTaskResponse(task);
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

    const createdTask = await this.prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: taskResponseSelect,
    });
    return this.mapTaskResponse(createdTask);
  }

  async createRecurringTask(
    familyId: string,
    createdByMemberId: string,
    dto: CreateRecurringTaskDto,
  ) {
    if (dto.taskCategoryId) {
      await this.assertActiveCategoryInFamily(familyId, dto.taskCategoryId);
    }
    this.assertValidTaskSchedule(dto.schedule);

    const createdTask = await this.prisma.task.create({
      data: {
        familyId,
        createdByMemberId,
        taskCategoryId: dto.taskCategoryId,
        title: dto.title,
        description: dto.description,
        taskType: TaskType.RECURRING,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        status: dto.status ?? TaskStatus.ACTIVE,
        schedule: {
          create: this.buildTaskScheduleCreateInput(dto.schedule),
        },
      },
      select: taskResponseSelect,
    });

    return {
      task: this.mapTaskResponse(createdTask, { includeSchedule: false }),
      schedule: this.mapTaskScheduleResponse(createdTask.schedule),
    };
  }

  async getTaskSchedule(familyId: string, taskId: string) {
    const task = await this.findRecurringTaskWithScheduleOrThrow(
      familyId,
      taskId,
    );
    const schedule = task.schedule;
    if (!schedule) {
      throw new NotFoundException('Không tìm thấy lịch lặp của công việc');
    }
    return this.mapTaskScheduleResponse(schedule);
  }

  async updateTaskSchedule(
    familyId: string,
    taskId: string,
    dto: UpdateTaskScheduleDto,
  ) {
    const task = await this.findRecurringTaskWithScheduleOrThrow(
      familyId,
      taskId,
    );
    const schedule = task.schedule;
    if (!schedule) {
      throw new NotFoundException('Không tìm thấy lịch lặp của công việc');
    }

    const mergedSchedule = {
      repeatType: dto.repeatType ?? schedule.repeatType,
      repeatInterval: dto.repeatInterval ?? schedule.repeatInterval,
      startDate: dto.startDate
        ? this.toDateOnly(dto.startDate)
        : this.toDateOnly(schedule.startDate),
      endDate:
        dto.endDate === undefined
          ? schedule.endDate
            ? this.toDateOnly(schedule.endDate)
            : null
          : dto.endDate
            ? this.toDateOnly(dto.endDate)
            : null,
      dayOfWeek:
        dto.dayOfWeek === undefined ? schedule.dayOfWeek : dto.dayOfWeek,
      status: dto.status ?? schedule.status,
    };
    this.assertValidTaskSchedule(mergedSchedule);

    const updatedSchedule = await this.prisma.taskSchedule.update({
      where: { taskId },
      data: {
        repeatType: dto.repeatType,
        repeatInterval: dto.repeatInterval,
        startDate: dto.startDate ? this.toDateOnly(dto.startDate) : undefined,
        endDate:
          dto.endDate === undefined
            ? undefined
            : dto.endDate
              ? this.toDateOnly(dto.endDate)
              : null,
        dayOfWeek:
          mergedSchedule.repeatType === TaskRepeatType.WEEKLY
            ? dto.dayOfWeek
            : null,
        status: dto.status,
      },
      select: taskScheduleResponseSelect,
    });

    return this.mapTaskScheduleResponse(updatedSchedule);
  }

  async generateRecurringTaskAssignments(
    familyId: string,
    taskId: string,
    assignedByMemberId: string,
    dto: GenerateTaskAssignmentsDto,
  ) {
    const fromDate = this.toDateOnly(dto.fromDate);
    const toDate = this.toDateOnly(dto.toDate);
    if (fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException(
        'Khoảng thời gian sinh phân công không hợp lệ',
      );
    }

    const task = await this.findRecurringTaskWithScheduleOrThrow(
      familyId,
      taskId,
    );
    const schedule = task.schedule;
    if (!schedule) {
      throw new NotFoundException('Không tìm thấy lịch lặp của công việc');
    }
    if (task.status !== TaskStatus.ACTIVE) {
      throw new BadRequestException(
        'Chỉ có thể sinh phân công cho công việc lặp lại đang hoạt động',
      );
    }
    if (schedule.status !== TaskScheduleStatus.ACTIVE) {
      throw new BadRequestException('Lịch lặp đã ngừng hoạt động');
    }
    await this.assertAssignableFamilyMemberInFamily(
      familyId,
      dto.assignedToMemberId,
    );

    const occurrenceDates = this.buildOccurrenceDates(schedule, {
      fromDate,
      toDate,
    });
    const assignmentCandidates = occurrenceDates.map((occurrenceDate) => {
      const startAt = dto.startTime
        ? this.buildVietnamDateTime(occurrenceDate, dto.startTime)
        : null;
      const dueAt = dto.dueTime
        ? this.buildVietnamDateTime(occurrenceDate, dto.dueTime)
        : this.buildVietnamEndOfDay(occurrenceDate);

      if (startAt && dueAt.getTime() <= startAt.getTime()) {
        throw new BadRequestException(
          'Thời gian kết thúc phải sau thời gian bắt đầu',
        );
      }

      return { occurrenceDate, startAt, dueAt };
    });

    const existingAssignments =
      assignmentCandidates.length === 0
        ? []
        : await this.prisma.taskAssignment.findMany({
          where: {
            taskId,
            assignedToMemberId: dto.assignedToMemberId,
            dueAt: { in: assignmentCandidates.map((item) => item.dueAt) },
          },
          select: { dueAt: true },
        });
    const existingDueAtTimes = new Set(
      existingAssignments
        .filter((assignment) => assignment.dueAt)
        .map((assignment) => assignment.dueAt!.getTime()),
    );

    let skippedDuplicateCount = 0;
    const createdAssignmentIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const candidate of assignmentCandidates) {
        if (existingDueAtTimes.has(candidate.dueAt.getTime())) {
          skippedDuplicateCount += 1;
          continue;
        }

        const assignment = await tx.taskAssignment.create({
          data: {
            taskId,
            assignedToMemberId: dto.assignedToMemberId,
            assignedByMemberId,
            status: TaskAssignmentStatus.ASSIGNED,
            startAt: candidate.startAt,
            dueAt: candidate.dueAt,
          },
          select: { id: true },
        });
        createdAssignmentIds.push(assignment.id);
      }
    });

    const assignments =
      createdAssignmentIds.length === 0
        ? []
        : await this.prisma.taskAssignment.findMany({
          where: { id: { in: createdAssignmentIds } },
          select: assignmentResponseSelect,
          orderBy: { dueAt: 'asc' },
        });

    return {
      task: {
        id: task.id,
        title: task.title,
        taskType: task.taskType,
        status: task.status,
        priority: task.priority,
      },
      schedule: this.mapTaskScheduleResponse(schedule),
      generatedCount: assignments.length,
      skippedDuplicateCount,
      assignments: assignments.map((assignment) =>
        this.mapAssignmentResponse(assignment),
      ),
    };
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

    const updatedTask = await this.prisma.task.update({
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
      select: taskResponseSelect,
    });
    return this.mapTaskResponse(updatedTask);
  }

  async cancelTask(familyId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, familyId },
    });
    if (!task) {
      throw new NotFoundException('Không tìm thấy công việc');
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.CANCELED },
      select: taskResponseSelect,
    });
    return this.mapTaskResponse(updatedTask);
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
    await this.assertAssignableFamilyMemberInFamily(
      familyId,
      dto.assignedToMemberId,
    );
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
        select: assignmentResponseSelect,
      });

    // Assignment đã tạo thành công — lỗi thông báo không được phép biến thao
    // tác đã thành công thành lỗi 5xx.
    try {
      await this.notificationsService.notify(
        familyId,
        [dto.assignedToMemberId],
        {
          type: NotificationType.TASK,
          priority: NotificationPriority.NORMAL,
          title: 'Bạn được giao công việc mới',
          body: `Bạn được giao công việc "${task.title}".`,
          referenceType: 'TASK_ASSIGNMENT',
          referenceId: assignment.id,
        },
      );
    } catch (err) {
      this.logger.error(
        `Không thể gửi thông báo giao công việc (assignment ${assignment.id}): ${(err as Error).message}`,
      );
    }

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

    const where: Prisma.TaskAssignmentWhereInput = {
      taskId,
      status: query.status,
      assignedToMemberId: this.isTaskManager(familyRole)
        ? undefined
        : currentMemberId,
    };

    const [assignments, total] = await this.prisma.$transaction([
      this.prisma.taskAssignment.findMany({
        where,
        select: assignmentResponseSelect,
        orderBy: [{ dueAt: 'asc' }, { assignedAt: 'desc' }],
        skip: skipFor(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.taskAssignment.count({ where }),
    ]);

    return buildPaginated(
      assignments.map((assignment) => this.mapAssignmentResponse(assignment)),
      total,
      query.page,
      query.limit,
    );
  }

  async listMyTaskAssignments(
    familyId: string,
    memberId: string,
    query: MyTaskAssignmentQueryDto,
  ) {
    const where: Prisma.TaskAssignmentWhereInput = {
      assignedToMemberId: memberId,
      status: query.status,
      startAt: this.buildDateRange(query.startFrom, query.startTo),
      dueAt: this.buildDateRange(query.dueFrom, query.dueTo),
      task: {
        familyId,
        priority: query.priority,
      },
    };

    const [assignments, total] = await this.prisma.$transaction([
      this.prisma.taskAssignment.findMany({
        where,
        select: assignmentWithTaskResponseSelect,
        orderBy: [{ dueAt: 'asc' }, { startAt: 'asc' }, { assignedAt: 'desc' }],
        skip: skipFor(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.taskAssignment.count({ where }),
    ]);

    return buildPaginated(
      assignments.map((assignment) =>
        this.mapAssignmentResponse(assignment, { includeTask: true }),
      ),
      total,
      query.page,
      query.limit,
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
    return this.mapAssignmentResponse(assignment, { includeTask: true });
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
      select: assignmentResponseSelect,
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
      select: assignmentResponseSelect,
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

    await this.assertAssignableFamilyMemberInFamily(
      familyId,
      dto.assignedToMemberId,
    );
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
      select: assignmentResponseSelect,
    });

    // Assignment đã được giao lại thành công — lỗi thông báo không được phép
    // biến thao tác đã thành công thành lỗi 5xx.
    try {
      await this.notificationsService.notify(
        familyId,
        [dto.assignedToMemberId],
        {
          type: NotificationType.TASK,
          priority: NotificationPriority.NORMAL,
          title: 'Bạn được giao công việc mới',
          body: `Bạn được giao công việc "${assignment.task.title}".`,
          referenceType: 'TASK_ASSIGNMENT',
          referenceId: updatedAssignment.id,
        },
      );
    } catch (err) {
      this.logger.error(
        `Không thể gửi thông báo giao lại công việc (assignment ${updatedAssignment.id}): ${(err as Error).message}`,
      );
    }

    return this.mapAssignmentResponse(updatedAssignment);
  }

  async reportTaskUnavailability(
    familyId: string,
    assignmentId: string,
    currentMemberId: string,
    dto: ReportTaskUnavailabilityDto,
  ) {
    const assignment = await this.prisma.taskAssignment.findFirst({
      where: { id: assignmentId, task: { familyId } },
      select: {
        id: true,
        assignedToMemberId: true,
        status: true,
      },
    });
    if (!assignment) {
      throw new NotFoundException('Không tìm thấy phân công công việc');
    }
    if (assignment.assignedToMemberId !== currentMemberId) {
      throw new ForbiddenException(
        'Bạn chỉ có thể báo không thể làm công việc được giao cho chính mình',
      );
    }
    const reportableStatuses: TaskAssignmentStatus[] = [
      TaskAssignmentStatus.ASSIGNED,
      TaskAssignmentStatus.IN_PROGRESS,
    ];
    if (!reportableStatuses.includes(assignment.status)) {
      throw new BadRequestException(
        'Chỉ có thể báo không thể làm khi công việc đang được giao hoặc đang thực hiện',
      );
    }

    const duplicate = await this.prisma.taskUnavailability.findFirst({
      where: {
        assignmentId,
        status: TaskUnavailabilityStatus.REPORTED,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('Phân công này đã có báo cáo chưa thể xử lý');
    }

    const unavailability = await this.prisma.taskUnavailability.create({
      data: {
        assignmentId,
        reportedByMemberId: currentMemberId,
        reason: dto.reason,
      },
      select: taskUnavailabilityResponseSelect,
    });

    return this.mapTaskUnavailabilityResponse(unavailability);
  }

  async getTaskUnavailabilities(
    familyId: string,
    currentMemberId: string,
    familyRole: FamilyRole,
    query: QueryTaskUnavailabilityDto,
  ) {
    const where: Prisma.TaskUnavailabilityWhereInput = {
      status: query.status,
      assignmentId: query.assignmentId,
      reportedByMemberId: this.isTaskManager(familyRole)
        ? query.reportedByMemberId
        : currentMemberId,
      assignment: {
        task: { familyId },
      },
    };

    const [unavailabilities, total] = await this.prisma.$transaction([
      this.prisma.taskUnavailability.findMany({
        where,
        select: taskUnavailabilityResponseSelect,
        orderBy: { reportedAt: 'desc' },
        skip: skipFor(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.taskUnavailability.count({ where }),
    ]);

    return buildPaginated(
      unavailabilities.map((unavailability) =>
        this.mapTaskUnavailabilityResponse(unavailability),
      ),
      total,
      query.page,
      query.limit,
    );
  }

  async getTaskUnavailabilityDetail(
    familyId: string,
    unavailabilityId: string,
    currentMemberId: string,
    familyRole: FamilyRole,
  ) {
    const unavailability = await this.findTaskUnavailabilityInFamily(
      familyId,
      unavailabilityId,
    );
    if (!unavailability) {
      throw new NotFoundException(
        'Không tìm thấy báo cáo không thể làm công việc',
      );
    }
    this.assertCanViewTaskUnavailability(
      unavailability,
      currentMemberId,
      familyRole,
    );
    return this.mapTaskUnavailabilityResponse(unavailability);
  }

  async cancelTaskUnavailability(
    familyId: string,
    unavailabilityId: string,
    currentMemberId: string,
  ) {
    const unavailability = await this.findTaskUnavailabilityInFamily(
      familyId,
      unavailabilityId,
    );
    if (!unavailability) {
      throw new NotFoundException(
        'Không tìm thấy báo cáo không thể làm công việc',
      );
    }
    if (unavailability.reportedByMemberId !== currentMemberId) {
      throw new ForbiddenException(
        'Chỉ người tạo báo cáo mới có thể hủy báo cáo',
      );
    }
    if (unavailability.status !== TaskUnavailabilityStatus.REPORTED) {
      throw new BadRequestException('Chỉ có thể hủy báo cáo đang chờ xử lý');
    }

    const updatedUnavailability = await this.prisma.taskUnavailability.update({
      where: { id: unavailabilityId },
      data: { status: TaskUnavailabilityStatus.CANCELED },
      select: taskUnavailabilityResponseSelect,
    });

    return this.mapTaskUnavailabilityResponse(updatedUnavailability);
  }

  async handleTaskUnavailability(
    familyId: string,
    unavailabilityId: string,
    currentMemberId: string,
    dto: HandleTaskUnavailabilityDto,
  ) {
    this.assertValidTimeRange(dto.startAt, dto.dueAt);

    const result = await this.prisma.$transaction(async (tx) => {
      const unavailability = await tx.taskUnavailability.findFirst({
        where: {
          id: unavailabilityId,
          assignment: { task: { familyId } },
        },
        select: {
          id: true,
          status: true,
          assignment: {
            select: {
              id: true,
              taskId: true,
              assignedToMemberId: true,
              status: true,
              startAt: true,
              dueAt: true,
            },
          },
        },
      });
      if (!unavailability) {
        throw new NotFoundException(
          'Không tìm thấy báo cáo không thể làm công việc',
        );
      }
      if (unavailability.status !== TaskUnavailabilityStatus.REPORTED) {
        throw new BadRequestException(
          'Báo cáo này đã được xử lý hoặc đã bị hủy',
        );
      }

      if (dto.action === HandleTaskUnavailabilityAction.REASSIGN) {
        if (!dto.newAssignedToMemberId) {
          throw new BadRequestException(
            'Thành viên được giao mới không được để trống',
          );
        }
        if (
          dto.newAssignedToMemberId ===
          unavailability.assignment.assignedToMemberId
        ) {
          throw new BadRequestException(
            'Không thể giao lại cho chính thành viên cũ',
          );
        }
        await this.assertAssignableFamilyMemberInFamily(
          familyId,
          dto.newAssignedToMemberId,
          tx,
        );
        this.assertUnavailabilityAssignmentHandleable(
          unavailability.assignment.status,
        );

        await tx.taskAssignment.update({
          where: { id: unavailability.assignment.id },
          data: { status: TaskAssignmentStatus.CANCELED },
        });

        await tx.taskAssignment.create({
          data: {
            taskId: unavailability.assignment.taskId,
            assignedToMemberId: dto.newAssignedToMemberId,
            assignedByMemberId: currentMemberId,
            status: TaskAssignmentStatus.ASSIGNED,
            startAt:
              dto.startAt === undefined
                ? unavailability.assignment.startAt
                : new Date(dto.startAt),
            dueAt:
              dto.dueAt === undefined
                ? unavailability.assignment.dueAt
                : new Date(dto.dueAt),
          },
        });
      }

      if (dto.action === HandleTaskUnavailabilityAction.CANCEL_ASSIGNMENT) {
        this.assertUnavailabilityAssignmentHandleable(
          unavailability.assignment.status,
        );
        await tx.taskAssignment.update({
          where: { id: unavailability.assignment.id },
          data: { status: TaskAssignmentStatus.CANCELED },
        });
      }

      const updatedUnavailability = await tx.taskUnavailability.update({
        where: { id: unavailabilityId },
        data: {
          status: TaskUnavailabilityStatus.HANDLED,
          handledByMemberId: currentMemberId,
          handledAt: new Date(),
        },
        select: taskUnavailabilityResponseSelect,
      });

      return updatedUnavailability;
    });

    const message =
      dto.action === HandleTaskUnavailabilityAction.REASSIGN
        ? 'Giao lại công việc thành công'
        : dto.action === HandleTaskUnavailabilityAction.CANCEL_ASSIGNMENT
          ? 'Hủy phân công công việc thành công'
          : 'Đánh dấu báo cáo đã được xử lý thành công';

    return withResponseMessage(
      message,
      this.mapTaskUnavailabilityResponse(result),
    );
  }

  async createRewardSetting(
    familyId: string,
    taskId: string,
    _currentMemberId: string,
    dto: CreateRewardSettingDto,
  ) {
    this.assertValidRewardSettingPayload(dto);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, familyId },
      select: {
        id: true,
        status: true,
        rewardSetting: { select: { id: true } },
      },
    });
    if (!task) {
      throw new NotFoundException('Không tìm thấy công việc');
    }
    if (task.status === TaskStatus.CANCELED) {
      throw new BadRequestException(
        'Công việc đã bị hủy nên không thể cấu hình thưởng',
      );
    }
    if (task.rewardSetting) {
      throw new ConflictException('Công việc đã có cấu hình thưởng');
    }

    const rewardSetting = await this.prisma.rewardSetting.create({
      data: {
        taskId,
        rewardType: dto.rewardType,
        rewardAmount: dto.rewardAmount ?? null,
        rewardDescription: dto.rewardDescription,
        autoCreateSettlement: dto.autoCreateSettlement ?? true,
      },
      select: rewardSettingResponseSelect,
    });

    return this.mapRewardSettingResponse(rewardSetting);
  }

  async getRewardSetting(
    familyId: string,
    taskId: string,
    _currentMemberId: string,
  ) {
    await this.findTaskInFamilyOrThrow(familyId, taskId);
    const rewardSetting = await this.prisma.rewardSetting.findUnique({
      where: { taskId },
      select: rewardSettingResponseSelect,
    });
    if (!rewardSetting) {
      throw new NotFoundException('Công việc chưa có cấu hình thưởng');
    }
    return this.mapRewardSettingResponse(rewardSetting);
  }

  async updateRewardSetting(
    familyId: string,
    taskId: string,
    _currentMemberId: string,
    dto: UpdateRewardSettingDto,
  ) {
    await this.findTaskInFamilyOrThrow(familyId, taskId);
    const rewardSetting = await this.prisma.rewardSetting.findUnique({
      where: { taskId },
      select: rewardSettingResponseSelect,
    });
    if (!rewardSetting) {
      throw new NotFoundException('Công việc chưa có cấu hình thưởng');
    }

    const merged = {
      rewardType: dto.rewardType ?? rewardSetting.rewardType,
      rewardAmount:
        dto.rewardAmount === undefined
          ? rewardSetting.rewardAmount
            ? Number(rewardSetting.rewardAmount)
            : undefined
          : dto.rewardAmount,
      rewardDescription:
        dto.rewardDescription === undefined
          ? (rewardSetting.rewardDescription ?? undefined)
          : dto.rewardDescription,
      autoCreateSettlement:
        dto.autoCreateSettlement ?? rewardSetting.autoCreateSettlement,
    };
    this.assertValidRewardSettingPayload(merged);

    const updatedRewardSetting = await this.prisma.rewardSetting.update({
      where: { taskId },
      data: {
        rewardType: dto.rewardType,
        rewardAmount:
          dto.rewardAmount === undefined ? undefined : dto.rewardAmount,
        rewardDescription: dto.rewardDescription,
        autoCreateSettlement: dto.autoCreateSettlement,
      },
      select: rewardSettingResponseSelect,
    });

    return this.mapRewardSettingResponse(updatedRewardSetting);
  }

  async deleteRewardSetting(
    familyId: string,
    taskId: string,
    _currentMemberId: string,
  ) {
    await this.findTaskInFamilyOrThrow(familyId, taskId);
    const rewardSetting = await this.prisma.rewardSetting.findUnique({
      where: { taskId },
      select: {
        ...rewardSettingResponseSelect,
        _count: { select: { settlements: true } },
      },
    });
    if (!rewardSetting) {
      throw new NotFoundException('Công việc chưa có cấu hình thưởng');
    }
    if (rewardSetting._count.settlements > 0) {
      throw new BadRequestException(
        'Không thể xóa cấu hình thưởng đã phát sinh ghi nhận thưởng',
      );
    }

    const deletedRewardSetting = await this.prisma.rewardSetting.delete({
      where: { taskId },
      select: rewardSettingResponseSelect,
    });
    return this.mapRewardSettingResponse(deletedRewardSetting);
  }

  async createRewardSettlementForSubmission(
    familyId: string,
    submissionId: string,
    _currentMemberId: string,
  ) {
    const rewardSettlement = await this.prisma.$transaction(async (tx) => {
      const submission = await tx.taskSubmission.findFirst({
        where: {
          id: submissionId,
          assignment: { task: { familyId } },
        },
        select: {
          id: true,
          submittedByMemberId: true,
          status: true,
          rewardSettlement: { select: { id: true } },
          assignment: {
            select: {
              assignedToMemberId: true,
              task: {
                select: {
                  rewardSetting: {
                    select: {
                      id: true,
                      rewardAmount: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!submission) {
        throw new NotFoundException('Không tìm thấy bài nộp công việc');
      }
      if (submission.status !== TaskSubmissionStatus.APPROVED) {
        throw new BadRequestException(
          'Bài nộp chưa được duyệt nên chưa thể tạo ghi nhận thưởng',
        );
      }
      if (!submission.assignment.task.rewardSetting) {
        throw new NotFoundException('Công việc chưa có cấu hình thưởng');
      }
      if (submission.rewardSettlement) {
        throw new ConflictException('Bài nộp này đã có ghi nhận thưởng');
      }

      const receiverMemberId =
        submission.submittedByMemberId ??
        submission.assignment.assignedToMemberId;

      const settlement = await tx.rewardSettlement.create({
        data: {
          taskSubmissionId: submission.id,
          rewardSettingId: submission.assignment.task.rewardSetting.id,
          receiverMemberId,
          amount:
            submission.assignment.task.rewardSetting.rewardAmount ??
            new Prisma.Decimal(0),
        },
        select: { id: true },
      });

      return tx.rewardSettlement.findUniqueOrThrow({
        where: { id: settlement.id },
        select: rewardSettlementResponseSelect,
      });
    });

    return this.mapRewardSettlementResponse(rewardSettlement);
  }

  async getRewardSettlements(
    familyId: string,
    currentMemberId: string,
    familyRole: FamilyRole,
    query: RewardSettlementQueryDto,
  ) {
    const where: Prisma.RewardSettlementWhereInput = {
      status: query.status,
      receiverMemberId: this.isTaskManager(familyRole)
        ? query.receiverMemberId
        : currentMemberId,
      taskSubmission: {
        assignment: {
          taskId: query.taskId,
          task: { familyId },
        },
      },
    };

    const [settlements, total] = await this.prisma.$transaction([
      this.prisma.rewardSettlement.findMany({
        where,
        select: rewardSettlementResponseSelect,
        orderBy: { createdAt: 'desc' },
        skip: skipFor(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.rewardSettlement.count({ where }),
    ]);

    return buildPaginated(
      settlements.map((settlement) =>
        this.mapRewardSettlementResponse(settlement),
      ),
      total,
      query.page,
      query.limit,
    );
  }

  async getRewardSettlementDetail(
    familyId: string,
    settlementId: string,
    currentMemberId: string,
    familyRole: FamilyRole,
  ) {
    const settlement = await this.findRewardSettlementInFamily(
      familyId,
      settlementId,
    );
    if (!settlement) {
      throw new NotFoundException('Không tìm thấy ghi nhận thưởng');
    }
    this.assertCanViewRewardSettlement(settlement, currentMemberId, familyRole);
    return this.mapRewardSettlementResponse(settlement);
  }

  async markRewardPaid(
    familyId: string,
    settlementId: string,
    currentMemberId: string,
    dto: MarkRewardPaidDto,
  ) {
    const settlement = await this.findRewardSettlementInFamily(
      familyId,
      settlementId,
    );
    if (!settlement) {
      throw new NotFoundException('Không tìm thấy ghi nhận thưởng');
    }
    if (settlement.status !== RewardSettlementStatus.PENDING_SETTLEMENT) {
      throw new BadRequestException(
        'Chỉ ghi nhận thưởng đang chờ trả mới được ghi nhận đã trả',
      );
    }

    const updatedSettlement = await this.prisma.rewardSettlement.update({
      where: { id: settlementId },
      data: {
        status: RewardSettlementStatus.WAITING_CONFIRMATION,
        settledByMemberId: currentMemberId,
        externalMethod: dto.externalMethod,
        externalNote: dto.externalNote,
        settledAt: new Date(),
      },
      select: rewardSettlementResponseSelect,
    });

    return this.mapRewardSettlementResponse(updatedSettlement);
  }

  async confirmRewardReceived(
    familyId: string,
    settlementId: string,
    currentMemberId: string,
  ) {
    const settlement = await this.findRewardSettlementInFamily(
      familyId,
      settlementId,
    );
    if (!settlement) {
      throw new NotFoundException('Không tìm thấy ghi nhận thưởng');
    }
    if (settlement.receiverMemberId !== currentMemberId) {
      throw new ForbiddenException(
        'Chỉ người nhận thưởng mới có thể xác nhận đã nhận',
      );
    }
    if (settlement.status !== RewardSettlementStatus.WAITING_CONFIRMATION) {
      throw new BadRequestException(
        'Chỉ ghi nhận thưởng đang chờ xác nhận mới được xác nhận đã nhận',
      );
    }

    const updatedSettlement = await this.prisma.rewardSettlement.update({
      where: { id: settlementId },
      data: {
        status: RewardSettlementStatus.SETTLED,
        confirmedAt: new Date(),
      },
      select: rewardSettlementResponseSelect,
    });

    return this.mapRewardSettlementResponse(updatedSettlement);
  }

  async cancelRewardSettlement(
    familyId: string,
    settlementId: string,
    _currentMemberId: string,
  ) {
    const settlement = await this.findRewardSettlementInFamily(
      familyId,
      settlementId,
    );
    if (!settlement) {
      throw new NotFoundException('Không tìm thấy ghi nhận thưởng');
    }

    const cancelableStatuses: RewardSettlementStatus[] = [
      RewardSettlementStatus.PENDING_SETTLEMENT,
      RewardSettlementStatus.WAITING_CONFIRMATION,
    ];
    if (!cancelableStatuses.includes(settlement.status)) {
      throw new BadRequestException(
        'Không thể hủy ghi nhận thưởng đã hoàn tất, tranh chấp hoặc đã hủy',
      );
    }

    const updatedSettlement = await this.prisma.rewardSettlement.update({
      where: { id: settlementId },
      data: { status: RewardSettlementStatus.CANCELED },
      select: rewardSettlementResponseSelect,
    });

    return this.mapRewardSettlementResponse(updatedSettlement);
  }

  async createRewardAllocations(
    familyId: string,
    settlementId: string,
    currentMemberId: string,
    dto: CreateRewardAllocationDto,
  ) {
    this.assertValidRewardAllocationPayload(dto);

    const allocations = await this.prisma.$transaction(
      async (tx) => {
        const settlement = await tx.rewardSettlement.findFirst({
          where: {
            id: settlementId,
            taskSubmission: { assignment: { task: { familyId } } },
          },
          select: {
            id: true,
            receiverMemberId: true,
            amount: true,
            status: true,
            rewardSetting: {
              select: {
                rewardType: true,
              },
            },
          },
        });
        if (!settlement) {
          throw new NotFoundException('Không tìm thấy ghi nhận thưởng');
        }
        if (settlement.receiverMemberId !== currentMemberId) {
          throw new ForbiddenException('Bạn không có quyền phân bổ thưởng này');
        }
        if (settlement.status !== RewardSettlementStatus.SETTLED) {
          throw new BadRequestException(
            'Chỉ thưởng đã hoàn tất mới được phân bổ',
          );
        }
        if (settlement.rewardSetting.rewardType !== RewardType.MONEY_RECORD) {
          throw new BadRequestException(
            'Chỉ thưởng dạng ghi nhận tiền mới được phân bổ vào tài chính',
          );
        }
        if (settlement.amount.lte(0)) {
          throw new BadRequestException('Số tiền phân bổ phải lớn hơn 0');
        }

        await this.assertRewardAllocationTargets(tx, familyId, dto);

        const existingAllocation = await tx.rewardAllocation.aggregate({
          where: { rewardSettlementId: settlement.id },
          _sum: { amount: true },
        });
        const existingAmount =
          existingAllocation._sum.amount ?? new Prisma.Decimal(0);
        const newAmount = dto.allocations.reduce(
          (total, allocation) => total.plus(allocation.amount),
          new Prisma.Decimal(0),
        );
        if (existingAmount.plus(newAmount).gt(settlement.amount)) {
          throw new BadRequestException(
            'Tổng số tiền phân bổ không được vượt quá số tiền thưởng',
          );
        }

        const ledger = await tx.financeLedger.findUnique({
          where: { familyId },
          select: { id: true, status: true },
        });
        const activeLedger =
          ledger?.status === FinanceLedgerStatus.ACTIVE ? ledger : null;
        const now = new Date();
        const createdAllocations: RewardAllocationResponsePayload[] = [];

        for (const allocation of dto.allocations) {
          const amount = new Prisma.Decimal(allocation.amount);
          let ledgerEntryId: string | null = null;

          if (activeLedger) {
            const ledgerEntry = await tx.ledgerEntry.create({
              data: {
                ledgerId: activeLedger.id,
                createdByMemberId: currentMemberId,
                entryType: LedgerEntryType.REWARD,
                amount,
                description: 'Phân bổ thưởng công việc',
                entryDate: now,
                status: LedgerEntryStatus.ACTIVE,
                sourceType: 'TASK_REWARD',
                sourceId: settlement.id,
              },
              select: { id: true },
            });
            ledgerEntryId = ledgerEntry.id;
          }

          createdAllocations.push(
            await tx.rewardAllocation.create({
              data: {
                rewardSettlementId: settlement.id,
                jarId: allocation.jarId,
                goalId: allocation.goalId,
                ledgerEntryId,
                amount,
                allocatedByMemberId: currentMemberId,
                allocatedAt: now,
              },
              select: rewardAllocationResponseSelect,
            }),
          );
        }

        return createdAllocations;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return allocations.map((allocation) =>
      this.mapRewardAllocationResponse(allocation),
    );
  }

  async getRewardAllocations(
    familyId: string,
    settlementId: string,
    currentMemberId: string,
    familyRole: FamilyRole,
    query: { page: number; limit: number },
  ) {
    const settlement = await this.findRewardSettlementInFamily(
      familyId,
      settlementId,
    );
    if (!settlement) {
      throw new NotFoundException('Không tìm thấy ghi nhận thưởng');
    }
    this.assertCanViewRewardSettlement(settlement, currentMemberId, familyRole);

    const where: Prisma.RewardAllocationWhereInput = {
      rewardSettlementId: settlementId,
    };

    const [allocations, total] = await this.prisma.$transaction([
      this.prisma.rewardAllocation.findMany({
        where,
        select: rewardAllocationResponseSelect,
        orderBy: { allocatedAt: 'desc' },
        skip: skipFor(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.rewardAllocation.count({ where }),
    ]);

    return buildPaginated(
      allocations.map((allocation) =>
        this.mapRewardAllocationResponse(allocation),
      ),
      total,
      query.page,
      query.limit,
    );
  }

  async createRewardDispute(
    familyId: string,
    settlementId: string,
    currentMemberId: string,
    dto: CreateRewardDisputeDto,
  ) {
    const dispute = await this.prisma.$transaction(async (tx) => {
      const settlement = await tx.rewardSettlement.findFirst({
        where: {
          id: settlementId,
          taskSubmission: { assignment: { task: { familyId } } },
        },
        select: {
          id: true,
          receiverMemberId: true,
          status: true,
        },
      });
      if (!settlement) {
        throw new NotFoundException('Không tìm thấy ghi nhận thưởng');
      }
      if (settlement.receiverMemberId !== currentMemberId) {
        throw new ForbiddenException(
          'Chỉ người nhận thưởng mới có thể gửi tranh chấp',
        );
      }

      const openDispute = await tx.rewardDispute.findFirst({
        where: {
          rewardSettlementId: settlement.id,
          status: RewardDisputeStatus.OPEN,
        },
        select: { id: true },
      });
      if (openDispute) {
        throw new ConflictException(
          'Ghi nhận thưởng này đang có tranh chấp chưa xử lý',
        );
      }
      if (settlement.status !== RewardSettlementStatus.WAITING_CONFIRMATION) {
        throw new BadRequestException(
          'Chỉ có thể tranh chấp khi thưởng đang chờ xác nhận',
        );
      }

      const createdDispute = await tx.rewardDispute.create({
        data: {
          rewardSettlementId: settlement.id,
          reportedByMemberId: currentMemberId,
          reason: dto.reason,
          status: RewardDisputeStatus.OPEN,
        },
        select: { id: true },
      });

      await tx.rewardSettlement.update({
        where: { id: settlement.id },
        data: { status: RewardSettlementStatus.DISPUTED },
        select: { id: true },
      });

      return tx.rewardDispute.findUniqueOrThrow({
        where: { id: createdDispute.id },
        select: rewardDisputeResponseSelect,
      });
    });

    return this.mapRewardDisputeResponse(dispute);
  }

  async getRewardDisputes(
    familyId: string,
    currentMemberId: string,
    familyRole: FamilyRole,
    query: QueryRewardDisputeDto,
  ) {
    const where: Prisma.RewardDisputeWhereInput = {
      status: query.status,
      rewardSettlementId: query.rewardSettlementId,
      reportedByMemberId: this.isTaskManager(familyRole)
        ? query.reportedByMemberId
        : currentMemberId,
      rewardSettlement: {
        taskSubmission: {
          assignment: {
            task: { familyId },
          },
        },
      },
    };

    const [disputes, total] = await this.prisma.$transaction([
      this.prisma.rewardDispute.findMany({
        where,
        select: rewardDisputeResponseSelect,
        orderBy: { createdAt: 'desc' },
        skip: skipFor(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.rewardDispute.count({ where }),
    ]);

    return buildPaginated(
      disputes.map((dispute) => this.mapRewardDisputeResponse(dispute)),
      total,
      query.page,
      query.limit,
    );
  }

  async getRewardDisputeDetail(
    familyId: string,
    disputeId: string,
    currentMemberId: string,
    familyRole: FamilyRole,
  ) {
    const dispute = await this.findRewardDisputeInFamily(familyId, disputeId);
    if (!dispute) {
      throw new NotFoundException('Không tìm thấy tranh chấp thưởng');
    }
    this.assertCanViewRewardDispute(dispute, currentMemberId, familyRole);
    return this.mapRewardDisputeResponse(dispute);
  }

  async resolveRewardDispute(
    familyId: string,
    disputeId: string,
    currentMemberId: string,
    dto: ResolveRewardDisputeDto,
  ) {
    const dispute = await this.prisma.$transaction(async (tx) => {
      const existingDispute = await tx.rewardDispute.findFirst({
        where: {
          id: disputeId,
          rewardSettlement: {
            taskSubmission: { assignment: { task: { familyId } } },
          },
        },
        select: {
          id: true,
          rewardSettlementId: true,
          status: true,
        },
      });
      if (!existingDispute) {
        throw new NotFoundException('Không tìm thấy tranh chấp thưởng');
      }
      if (existingDispute.status !== RewardDisputeStatus.OPEN) {
        throw new BadRequestException('Chỉ có thể xử lý tranh chấp đang mở');
      }

      const resolvedAt = new Date();
      let disputeStatus: RewardDisputeStatus;
      let settlementStatus: RewardSettlementStatus;

      if (dto.action === ResolveRewardDisputeAction.ACCEPT_DISPUTE) {
        disputeStatus = RewardDisputeStatus.RESOLVED;
        settlementStatus = RewardSettlementStatus.PENDING_SETTLEMENT;
      } else if (dto.action === ResolveRewardDisputeAction.REJECT_DISPUTE) {
        disputeStatus = RewardDisputeStatus.REJECTED;
        settlementStatus = RewardSettlementStatus.WAITING_CONFIRMATION;
      } else {
        throw new BadRequestException(
          'Hành động xử lý tranh chấp không hợp lệ',
        );
      }

      await tx.rewardDispute.update({
        where: { id: existingDispute.id },
        data: {
          status: disputeStatus,
          resolvedByMemberId: currentMemberId,
          resolvedAt,
        },
        select: { id: true },
      });
      await tx.rewardSettlement.update({
        where: { id: existingDispute.rewardSettlementId },
        data: { status: settlementStatus },
        select: { id: true },
      });

      return tx.rewardDispute.findUniqueOrThrow({
        where: { id: existingDispute.id },
        select: rewardDisputeResponseSelect,
      });
    });

    return this.mapRewardDisputeResponse(dispute);
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
        select: {
          assignedToMemberId: true,
          status: true,
        },
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
        select: submissionResponseSelect,
      });
    });

    return this.mapSubmissionResponseWithFreshProofUrls(submission);
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

    const updatedProof = await this.prisma.taskProof.update({
      where: { id: proofId },
      data: {
        proofType: dto.proofType,
        fileUrl: dto.fileUrl,
        thumbnailUrl: dto.thumbnailUrl,
        note: dto.note,
      },
      select: proofResponseSelect,
    });
    return this.mapProofResponse(updatedProof);
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

    const deletedProof = await this.prisma.taskProof.delete({
      where: { id: proofId },
      select: proofResponseSelect,
    });
    return this.mapProofResponse(deletedProof);
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

    const where: Prisma.TaskSubmissionWhereInput = {
      assignmentId,
      status: query.status,
    };

    const [submissions, total] = await this.prisma.$transaction([
      this.prisma.taskSubmission.findMany({
        where,
        select: submissionListItemSelect,
        orderBy: { submittedAt: 'desc' },
        skip: skipFor(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.taskSubmission.count({ where }),
    ]);

    const items = await Promise.all(
      submissions.map((submission) =>
        this.mapSubmissionListItemResponseWithFreshProofUrls(submission),
      ),
    );

    return buildPaginated(items, total, query.page, query.limit);
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
    return this.mapSubmissionResponseWithFreshProofUrls(submission);
  }

  async reviewTaskSubmission(
    familyId: string,
    submissionId: string,
    reviewerMemberId: string,
    dto: ReviewTaskSubmissionDto,
  ) {
    let notificationIds: string[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      const submission = await tx.taskSubmission.findFirst({
        where: {
          id: submissionId,
          assignment: { task: { familyId } },
        },
        select: {
          id: true,
          assignmentId: true,
          submittedByMemberId: true,
          status: true,
          rewardSettlement: { select: { id: true } },
          assignment: {
            select: {
              taskId: true,
              assignedToMemberId: true,
              task: {
                select: {
                  title: true,
                  taskType: true,
                  rewardSetting: {
                    select: {
                      id: true,
                      rewardAmount: true,
                      autoCreateSettlement: true,
                    },
                  },
                },
              },
            },
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
        const { ids } = await this.notificationsService.notify(
          familyId,
          [submission.assignment.assignedToMemberId],
          {
            type: NotificationType.TASK,
            priority: NotificationPriority.LOW,
            title: 'Công việc được nghiệm thu',
            body: `Công việc "${submission.assignment.task.title}" của bạn đã được duyệt hoàn thành.`,
            referenceType: 'TASK_ASSIGNMENT',
            referenceId: submission.assignmentId,
          },
          { tx },
        );
        notificationIds = ids;

        await this.createRewardSettlementAfterApproval(tx, submission);

        if (submission.assignment.task.taskType === TaskType.AD_HOC) {
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
        }
      } else {
        if (submission.assignment.task.taskType === TaskType.AD_HOC) {
          await tx.task.update({
            where: { id: submission.assignment.taskId },
            data: { status: TaskStatus.ACTIVE },
          });
        }
      }

      return tx.taskSubmission.findUniqueOrThrow({
        where: { id: reviewedSubmission.id },
        select: submissionResponseSelect,
      });
    });

    await this.notificationsService.dispatch(notificationIds);

    return withResponseMessage(
      dto.decision === ReviewTaskSubmissionDecision.APPROVED
        ? 'Duyệt hoàn thành công việc thành công'
        : 'Từ chối hoàn thành công việc thành công',
      await this.mapSubmissionResponseWithFreshProofUrls(result),
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

  private async findRecurringTaskWithScheduleOrThrow(
    familyId: string,
    taskId: string,
  ) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, familyId },
      select: {
        id: true,
        title: true,
        taskType: true,
        status: true,
        priority: true,
        schedule: {
          select: taskScheduleResponseSelect,
        },
      },
    });
    if (!task) {
      throw new NotFoundException('Không tìm thấy công việc');
    }
    if (task.taskType !== TaskType.RECURRING) {
      throw new BadRequestException('Chỉ công việc lặp lại mới có lịch lặp');
    }
    if (!task.schedule) {
      throw new NotFoundException('Không tìm thấy lịch lặp của công việc');
    }
    return task;
  }

  private findAssignmentInFamily(familyId: string, assignmentId: string) {
    return this.prisma.taskAssignment.findFirst({
      where: {
        id: assignmentId,
        task: { familyId },
      },
      select: assignmentWithTaskResponseSelect,
    });
  }

  private findSubmissionInFamily(familyId: string, submissionId: string) {
    return this.prisma.taskSubmission.findFirst({
      where: {
        id: submissionId,
        assignment: { task: { familyId } },
      },
      select: submissionResponseSelect,
    });
  }

  private findTaskUnavailabilityInFamily(
    familyId: string,
    unavailabilityId: string,
  ) {
    return this.prisma.taskUnavailability.findFirst({
      where: {
        id: unavailabilityId,
        assignment: { task: { familyId } },
      },
      select: taskUnavailabilityResponseSelect,
    });
  }

  private findRewardSettlementInFamily(familyId: string, settlementId: string) {
    return this.prisma.rewardSettlement.findFirst({
      where: {
        id: settlementId,
        taskSubmission: {
          assignment: { task: { familyId } },
        },
      },
      select: rewardSettlementResponseSelect,
    });
  }

  private findRewardDisputeInFamily(familyId: string, disputeId: string) {
    return this.prisma.rewardDispute.findFirst({
      where: {
        id: disputeId,
        rewardSettlement: {
          taskSubmission: {
            assignment: { task: { familyId } },
          },
        },
      },
      select: rewardDisputeResponseSelect,
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
      select: {
        id: true,
        proofType: true,
        fileUrl: true,
        note: true,
        submission: {
          select: {
            submittedByMemberId: true,
            status: true,
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
      throw new BadRequestException(RECURRING_ASSIGNMENT_MESSAGE);
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

  private async assertAssignableFamilyMemberInFamily(
    familyId: string,
    memberId: string,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const member = await client.familyMember.findFirst({
      where: {
        id: memberId,
        familyId,
        status: MemberStatus.ACTIVE,
      },
    });
    if (!member) {
      throw new BadRequestException(
        'Thành viên được giao mới không hợp lệ hoặc không thuộc gia đình này',
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

  private assertValidTaskSchedule(schedule: TaskScheduleValidationInput) {
    if (schedule.repeatInterval <= 0) {
      throw new BadRequestException('Khoảng lặp phải lớn hơn 0');
    }

    const startDate = this.toDateOnly(schedule.startDate);
    const endDate = schedule.endDate
      ? this.toDateOnly(schedule.endDate)
      : undefined;
    if (endDate && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException(
        'Ngày kết thúc lịch lặp phải sau hoặc bằng ngày bắt đầu',
      );
    }

    if (schedule.repeatType === TaskRepeatType.WEEKLY && !schedule.dayOfWeek) {
      throw new BadRequestException(
        'Công việc lặp lại theo tuần bắt buộc có thứ trong tuần',
      );
    }

    if (
      schedule.dayOfWeek !== null &&
      schedule.dayOfWeek !== undefined &&
      (schedule.dayOfWeek < 1 || schedule.dayOfWeek > 7)
    ) {
      throw new BadRequestException(
        'Thứ trong tuần phải nằm trong khoảng 1 đến 7',
      );
    }
  }

  private assertValidRewardSettingPayload(setting: {
    rewardType: RewardType;
    rewardAmount?: number | null;
    rewardDescription?: string | null;
    autoCreateSettlement?: boolean;
  }) {
    if (
      setting.rewardAmount !== null &&
      setting.rewardAmount !== undefined &&
      setting.rewardAmount < 0
    ) {
      throw new BadRequestException('Số tiền/thưởng phải lớn hơn hoặc bằng 0');
    }

    const amountRequiredTypes: RewardType[] = [
      RewardType.MONEY_RECORD,
      RewardType.POINT,
    ];
    if (
      amountRequiredTypes.includes(setting.rewardType) &&
      (setting.rewardAmount === null || setting.rewardAmount === undefined)
    ) {
      throw new BadRequestException(
        'Loại thưởng này bắt buộc nhập số tiền hoặc điểm thưởng',
      );
    }

    if (
      setting.rewardType === RewardType.OTHER &&
      !setting.rewardDescription?.trim()
    ) {
      throw new BadRequestException(
        'Loại thưởng khác bắt buộc nhập mô tả thưởng',
      );
    }
  }

  private assertValidRewardAllocationPayload(dto: CreateRewardAllocationDto) {
    if (!dto.allocations?.length) {
      throw new BadRequestException('Cần có ít nhất một phân bổ thưởng');
    }

    let totalAmount = new Prisma.Decimal(0);
    for (const allocation of dto.allocations) {
      if (!allocation.jarId && !allocation.goalId) {
        throw new BadRequestException(
          'Mỗi phân bổ phải chọn quỹ hoặc mục tiêu tài chính',
        );
      }
      const amount = new Prisma.Decimal(allocation.amount ?? 0);
      if (amount.lte(0)) {
        throw new BadRequestException('Số tiền phân bổ phải lớn hơn 0');
      }
      totalAmount = totalAmount.plus(amount);
    }

    if (totalAmount.lte(0)) {
      throw new BadRequestException('Tổng số tiền phân bổ phải lớn hơn 0');
    }
  }

  private async assertRewardAllocationTargets(
    tx: Prisma.TransactionClient,
    familyId: string,
    dto: CreateRewardAllocationDto,
  ) {
    const jarIds = [
      ...new Set(
        dto.allocations
          .map((allocation) => allocation.jarId)
          .filter((jarId): jarId is string => Boolean(jarId)),
      ),
    ];
    if (jarIds.length > 0) {
      const validJars = await tx.financeJar.findMany({
        where: {
          id: { in: jarIds },
          isActive: true,
          financeModel: { familyId },
        },
        select: { id: true },
      });
      if (validJars.length !== jarIds.length) {
        throw new BadRequestException(
          'Quỹ tài chính không hợp lệ hoặc không thuộc gia đình này',
        );
      }
    }

    const goalIds = [
      ...new Set(
        dto.allocations
          .map((allocation) => allocation.goalId)
          .filter((goalId): goalId is string => Boolean(goalId)),
      ),
    ];
    if (goalIds.length > 0) {
      const validGoals = await tx.financialGoal.findMany({
        where: {
          id: { in: goalIds },
          familyId,
          status: FinancialGoalStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (validGoals.length !== goalIds.length) {
        throw new BadRequestException(
          'Mục tiêu tài chính không hợp lệ hoặc không thuộc gia đình này',
        );
      }
    }
  }

  private async createRewardSettlementAfterApproval(
    tx: Prisma.TransactionClient,
    submission: {
      id: string;
      submittedByMemberId: string;
      rewardSettlement: { id: string } | null;
      assignment: {
        assignedToMemberId: string;
        task: {
          rewardSetting: {
            id: string;
            rewardAmount: Prisma.Decimal | null;
            autoCreateSettlement: boolean;
          } | null;
        };
      };
    },
  ) {
    const rewardSetting = submission.assignment.task.rewardSetting;
    if (
      !rewardSetting ||
      !rewardSetting.autoCreateSettlement ||
      submission.rewardSettlement
    ) {
      return;
    }

    await tx.rewardSettlement.create({
      data: {
        taskSubmissionId: submission.id,
        rewardSettingId: rewardSetting.id,
        receiverMemberId:
          submission.submittedByMemberId ??
          submission.assignment.assignedToMemberId,
        amount: rewardSetting.rewardAmount ?? new Prisma.Decimal(0),
      },
    });
  }

  private buildTaskScheduleCreateInput(
    schedule: TaskScheduleDto,
  ): Prisma.TaskScheduleCreateWithoutTaskInput {
    return {
      repeatType: schedule.repeatType,
      repeatInterval: schedule.repeatInterval,
      startDate: this.toDateOnly(schedule.startDate),
      endDate: schedule.endDate ? this.toDateOnly(schedule.endDate) : null,
      dayOfWeek:
        schedule.repeatType === TaskRepeatType.WEEKLY
          ? schedule.dayOfWeek
          : null,
      status: schedule.status ?? TaskScheduleStatus.ACTIVE,
    };
  }

  private buildOccurrenceDates(
    schedule: TaskScheduleResponsePayload,
    range: { fromDate: Date; toDate: Date },
  ) {
    const scheduleStart = this.toDateOnly(schedule.startDate);
    const scheduleEnd = schedule.endDate
      ? this.toDateOnly(schedule.endDate)
      : undefined;
    const rangeStart = this.maxDate(range.fromDate, scheduleStart);
    const rangeEnd = scheduleEnd
      ? this.minDate(range.toDate, scheduleEnd)
      : range.toDate;

    if (rangeStart.getTime() > rangeEnd.getTime()) {
      return [];
    }

    if (schedule.repeatType === TaskRepeatType.MONTHLY) {
      return this.buildMonthlyOccurrenceDates(schedule, {
        rangeStart,
        rangeEnd,
        scheduleStart,
      });
    }

    const occurrenceDates: Date[] = [];
    for (
      let current = rangeStart;
      current.getTime() <= rangeEnd.getTime();
      current = this.addDays(current, 1)
    ) {
      const dayDiff = this.diffDays(scheduleStart, current);
      if (dayDiff < 0) {
        continue;
      }

      if (
        schedule.repeatType === TaskRepeatType.DAILY &&
        dayDiff % schedule.repeatInterval === 0
      ) {
        occurrenceDates.push(current);
      }

      if (
        schedule.repeatType === TaskRepeatType.WEEKLY &&
        schedule.dayOfWeek &&
        this.getIsoDayOfWeek(current) === schedule.dayOfWeek
      ) {
        const weekDiff = this.diffDays(
          this.startOfIsoWeek(scheduleStart),
          this.startOfIsoWeek(current),
        );
        if (weekDiff >= 0 && weekDiff % (schedule.repeatInterval * 7) === 0) {
          occurrenceDates.push(current);
        }
      }
    }

    return occurrenceDates;
  }

  private buildMonthlyOccurrenceDates(
    schedule: TaskScheduleResponsePayload,
    dates: { rangeStart: Date; rangeEnd: Date; scheduleStart: Date },
  ) {
    const occurrenceDates: Date[] = [];
    const startMonthIndex = this.monthIndex(dates.scheduleStart);
    const rangeStartMonthIndex = this.monthIndex(dates.rangeStart);
    const rangeEndMonthIndex = this.monthIndex(dates.rangeEnd);
    const dayOfMonth = dates.scheduleStart.getUTCDate();

    for (
      let monthIndex = Math.max(startMonthIndex, rangeStartMonthIndex);
      monthIndex <= rangeEndMonthIndex;
      monthIndex += 1
    ) {
      if ((monthIndex - startMonthIndex) % schedule.repeatInterval !== 0) {
        continue;
      }

      const year = Math.floor(monthIndex / 12);
      const month = monthIndex % 12;
      if (dayOfMonth > this.daysInMonth(year, month)) {
        continue;
      }

      const candidate = new Date(Date.UTC(year, month, dayOfMonth));
      if (
        candidate.getTime() >= dates.rangeStart.getTime() &&
        candidate.getTime() <= dates.rangeEnd.getTime() &&
        candidate.getTime() >= dates.scheduleStart.getTime()
      ) {
        occurrenceDates.push(candidate);
      }
    }

    return occurrenceDates;
  }

  private toDateOnly(value: string | Date) {
    if (value instanceof Date) {
      return new Date(
        Date.UTC(
          value.getUTCFullYear(),
          value.getUTCMonth(),
          value.getUTCDate(),
        ),
      );
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) {
      throw new BadRequestException('Ngày không hợp lệ');
    }

    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }

  private buildVietnamDateTime(dateOnly: Date, time: string) {
    const [hour, minute] = time.split(':').map(Number);
    return this.buildVietnamDateTimeFromParts(dateOnly, hour, minute, 0, 0);
  }

  private buildVietnamEndOfDay(dateOnly: Date) {
    return this.buildVietnamDateTimeFromParts(dateOnly, 23, 59, 59, 999);
  }

  private buildVietnamDateTimeFromParts(
    dateOnly: Date,
    hour: number,
    minute: number,
    second: number,
    millisecond: number,
  ) {
    const localUtcMilliseconds = Date.UTC(
      dateOnly.getUTCFullYear(),
      dateOnly.getUTCMonth(),
      dateOnly.getUTCDate(),
      hour,
      minute,
      second,
      millisecond,
    );
    return new Date(
      localUtcMilliseconds - VIETNAM_TIME_ZONE_OFFSET_MINUTES * 60 * 1000,
    );
  }

  private maxDate(first: Date, second: Date) {
    return first.getTime() >= second.getTime() ? first : second;
  }

  private minDate(first: Date, second: Date) {
    return first.getTime() <= second.getTime() ? first : second;
  }

  private addDays(date: Date, days: number) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + days,
      ),
    );
  }

  private diffDays(from: Date, to: Date) {
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    return Math.round((to.getTime() - from.getTime()) / millisecondsPerDay);
  }

  private getIsoDayOfWeek(date: Date) {
    const day = date.getUTCDay();
    return day === 0 ? 7 : day;
  }

  private startOfIsoWeek(date: Date) {
    return this.addDays(date, 1 - this.getIsoDayOfWeek(date));
  }

  private monthIndex(date: Date) {
    return date.getUTCFullYear() * 12 + date.getUTCMonth();
  }

  private daysInMonth(year: number, month: number) {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
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

  private assertCanViewTaskUnavailability(
    unavailability: { reportedByMemberId: string },
    currentMemberId: string,
    familyRole: FamilyRole,
  ) {
    if (
      !this.isTaskManager(familyRole) &&
      unavailability.reportedByMemberId !== currentMemberId
    ) {
      throw new ForbiddenException('Bạn không có quyền xem báo cáo này');
    }
  }

  private assertCanViewRewardSettlement(
    settlement: { receiverMemberId: string },
    currentMemberId: string,
    familyRole: FamilyRole,
  ) {
    if (
      !this.isTaskManager(familyRole) &&
      settlement.receiverMemberId !== currentMemberId
    ) {
      throw new ForbiddenException(
        'Bạn không có quyền xem ghi nhận thưởng này',
      );
    }
  }

  private assertCanViewRewardDispute(
    dispute: { reportedByMemberId: string },
    currentMemberId: string,
    familyRole: FamilyRole,
  ) {
    if (
      !this.isTaskManager(familyRole) &&
      dispute.reportedByMemberId !== currentMemberId
    ) {
      throw new ForbiddenException('Bạn không có quyền xem tranh chấp này');
    }
  }

  private assertUnavailabilityAssignmentHandleable(
    status: TaskAssignmentStatus,
  ) {
    const blockedStatuses: TaskAssignmentStatus[] = [
      TaskAssignmentStatus.SUBMITTED,
      TaskAssignmentStatus.APPROVED,
      TaskAssignmentStatus.CANCELED,
    ];
    if (blockedStatuses.includes(status)) {
      throw new BadRequestException(
        'Không thể xử lý phân công đã nộp, đã duyệt hoặc đã bị hủy',
      );
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

  private mapMemberSummary(member: MemberSummaryPayload | null) {
    if (!member) {
      return null;
    }

    return {
      id: member.id,
      userId: member.userId,
      familyRole: member.familyRole,
      status: member.status,
      user: {
        id: member.user.id,
        fullName: member.user.fullName,
        avatarUrl: member.user.avatarUrl,
      },
    };
  }

  private mapMemberCompactSummary(member: MemberCompactSummaryPayload | null) {
    if (!member) {
      return null;
    }

    return {
      id: member.id,
      userId: member.userId,
      user: {
        id: member.user.id,
        fullName: member.user.fullName,
        avatarUrl: member.user.avatarUrl,
      },
    };
  }

  private mapUnavailabilityMember(member: UnavailabilityMemberPayload | null) {
    if (!member) {
      return null;
    }

    return {
      id: member.id,
      displayName: member.displayName ?? member.user.fullName,
      familyRole: member.familyRole,
    };
  }

  private mapCategoryResponse(category: CategoryResponsePayload | null) {
    if (!category) {
      return null;
    }

    return {
      id: category.id,
      familyId: category.familyId,
      name: category.name,
      description: category.description,
      status: category.status,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  private mapCategorySummary(category: CategorySummaryPayload | null) {
    if (!category) {
      return null;
    }

    return {
      id: category.id,
      name: category.name,
      status: category.status,
    };
  }

  private mapTaskScheduleResponse(
    schedule: TaskScheduleResponsePayload | null,
  ) {
    if (!schedule) {
      return null;
    }

    return {
      id: schedule.id,
      taskId: schedule.taskId,
      repeatType: schedule.repeatType,
      repeatInterval: schedule.repeatInterval,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      dayOfWeek: schedule.dayOfWeek,
      status: schedule.status,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    };
  }

  private mapTaskListItem(task: TaskListItemPayload) {
    return {
      id: task.id,
      familyId: task.familyId,
      taskCategoryId: task.taskCategoryId,
      title: task.title,
      description: task.description,
      taskType: task.taskType,
      priority: task.priority,
      status: task.status,
      createdByMemberId: task.createdByMemberId,
      dueAt: task.dueAt,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      category: this.mapCategorySummary(task.category),
      createdByMember: this.mapMemberCompactSummary(task.createdByMember),
    };
  }

  private mapTaskResponse(
    task: TaskResponsePayload,
    options: { includeSchedule?: boolean } = { includeSchedule: true },
  ) {
    const response = {
      id: task.id,
      familyId: task.familyId,
      taskCategoryId: task.taskCategoryId,
      title: task.title,
      description: task.description,
      taskType: task.taskType,
      priority: task.priority,
      status: task.status,
      createdByMemberId: task.createdByMemberId,
      dueAt: task.dueAt,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      category: this.mapCategoryResponse(task.category),
      createdByMember: this.mapMemberSummary(task.createdByMember),
    };

    if (options.includeSchedule && task.taskType === TaskType.RECURRING) {
      return {
        ...response,
        schedule: this.mapTaskScheduleResponse(task.schedule),
      };
    }

    return response;
  }

  private mapTaskSummary(task: TaskSummaryPayload) {
    return {
      id: task.id,
      familyId: task.familyId,
      taskCategoryId: task.taskCategoryId,
      title: task.title,
      taskType: task.taskType,
      priority: task.priority,
      status: task.status,
      dueAt: task.dueAt,
      category: this.mapCategorySummary(task.category),
    };
  }

  private mapAssignmentResponse(
    assignment: AssignmentResponsePayload | AssignmentWithTaskResponsePayload,
    options: { includeTask?: boolean } = {},
  ) {
    const response = {
      id: assignment.id,
      taskId: assignment.taskId,
      assignedToMemberId: assignment.assignedToMemberId,
      assignedByMemberId: assignment.assignedByMemberId,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      startAt: assignment.startAt,
      dueAt: assignment.dueAt,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
      isOverdue: this.isAssignmentOverdue(assignment),
      assignedToMember: this.mapMemberSummary(assignment.assignedToMember),
      assignedByMember: this.mapMemberSummary(assignment.assignedByMember),
    };

    if (options.includeTask && 'task' in assignment) {
      return {
        ...response,
        task: this.mapTaskSummary(assignment.task),
      };
    }

    return response;
  }

  private mapTaskUnavailabilityResponse(
    unavailability: TaskUnavailabilityResponsePayload,
  ) {
    return {
      id: unavailability.id,
      assignmentId: unavailability.assignmentId,
      reason: unavailability.reason,
      status: unavailability.status,
      reportedAt: unavailability.reportedAt,
      handledAt: unavailability.handledAt,
      reportedByMember: this.mapUnavailabilityMember(
        unavailability.reportedByMember,
      ),
      handledByMember: this.mapUnavailabilityMember(
        unavailability.handledByMember,
      ),
      assignment: {
        id: unavailability.assignment.id,
        status: unavailability.assignment.status,
        assignedAt: unavailability.assignment.assignedAt,
        startAt: unavailability.assignment.startAt,
        dueAt: unavailability.assignment.dueAt,
        isOverdue: this.isAssignmentOverdue(unavailability.assignment),
        task: {
          id: unavailability.assignment.task.id,
          title: unavailability.assignment.task.title,
          taskType: unavailability.assignment.task.taskType,
          priority: unavailability.assignment.task.priority,
          status: unavailability.assignment.task.status,
        },
        assignedToMember: this.mapUnavailabilityMember(
          unavailability.assignment.assignedToMember,
        ),
      },
    };
  }

  private mapRewardSettingResponse(setting: RewardSettingResponsePayload) {
    return {
      id: setting.id,
      taskId: setting.taskId,
      rewardType: setting.rewardType,
      rewardAmount: setting.rewardAmount,
      rewardDescription: setting.rewardDescription,
      autoCreateSettlement: setting.autoCreateSettlement,
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
    };
  }

  private mapRewardSettlementResponse(
    settlement: RewardSettlementResponsePayload,
  ) {
    return {
      id: settlement.id,
      taskSubmissionId: settlement.taskSubmissionId,
      rewardSettingId: settlement.rewardSettingId,
      receiverMemberId: settlement.receiverMemberId,
      settledByMemberId: settlement.settledByMemberId,
      amount: settlement.amount,
      status: settlement.status,
      externalMethod: settlement.externalMethod,
      externalNote: settlement.externalNote,
      settledAt: settlement.settledAt,
      confirmedAt: settlement.confirmedAt,
      createdAt: settlement.createdAt,
      updatedAt: settlement.updatedAt,
      receiverMember: this.mapUnavailabilityMember(settlement.receiverMember),
      settledByMember: this.mapUnavailabilityMember(settlement.settledByMember),
      task: {
        id: settlement.taskSubmission.assignment.task.id,
        title: settlement.taskSubmission.assignment.task.title,
        taskType: settlement.taskSubmission.assignment.task.taskType,
        priority: settlement.taskSubmission.assignment.task.priority,
        status: settlement.taskSubmission.assignment.task.status,
      },
      submission: {
        id: settlement.taskSubmission.id,
        submissionStatus: settlement.taskSubmission.status,
        submittedAt: settlement.taskSubmission.submittedAt,
        reviewedAt: settlement.taskSubmission.reviewedAt,
      },
    };
  }

  private mapRewardAllocationResponse(
    allocation: RewardAllocationResponsePayload,
  ) {
    return {
      id: allocation.id,
      rewardSettlementId: allocation.rewardSettlementId,
      jarId: allocation.jarId,
      goalId: allocation.goalId,
      ledgerEntryId: allocation.ledgerEntryId,
      amount: allocation.amount,
      allocatedByMemberId: allocation.allocatedByMemberId,
      allocatedAt: allocation.allocatedAt,
      jar: allocation.jar
        ? {
          id: allocation.jar.id,
          name: allocation.jar.name,
        }
        : null,
      goal: allocation.goal
        ? {
          id: allocation.goal.id,
          goalName: allocation.goal.goalName,
        }
        : null,
      allocatedByMember: this.mapUnavailabilityMember(
        allocation.allocatedByMember,
      ),
    };
  }

  private mapRewardDisputeResponse(dispute: RewardDisputeResponsePayload) {
    return {
      id: dispute.id,
      rewardSettlementId: dispute.rewardSettlementId,
      reason: dispute.reason,
      status: dispute.status,
      createdAt: dispute.createdAt,
      resolvedAt: dispute.resolvedAt,
      reportedByMember: this.mapUnavailabilityMember(dispute.reportedByMember),
      resolvedByMember: this.mapUnavailabilityMember(dispute.resolvedByMember),
      rewardSettlement: {
        id: dispute.rewardSettlement.id,
        amount: dispute.rewardSettlement.amount,
        status: dispute.rewardSettlement.status,
        externalMethod: dispute.rewardSettlement.externalMethod,
        settledAt: dispute.rewardSettlement.settledAt,
        confirmedAt: dispute.rewardSettlement.confirmedAt,
      },
    };
  }

  private mapSubmissionResponse(submission: SubmissionResponsePayload) {
    return {
      id: submission.id,
      assignmentId: submission.assignmentId,
      submittedByMemberId: submission.submittedByMemberId,
      submissionNote: submission.submissionNote,
      status: submission.status,
      reviewedByMemberId: submission.reviewedByMemberId,
      reviewNote: submission.reviewNote,
      submittedAt: submission.submittedAt,
      reviewedAt: submission.reviewedAt,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
      isLate: this.isSubmissionLate(submission),
      proofs: submission.proofs.map((proof) => this.mapProofResponse(proof)),
      submittedByMember: this.mapMemberSummary(submission.submittedByMember),
      reviewedByMember: this.mapMemberSummary(submission.reviewedByMember),
    };
  }

  private async mapSubmissionResponseWithFreshProofUrls(
    submission: SubmissionResponsePayload,
  ) {
    const response = this.mapSubmissionResponse(submission);
    return {
      ...response,
      proofs: await Promise.all(
        submission.proofs.map((proof) =>
          this.mapProofResponseWithFreshFileUrls(proof),
        ),
      ),
    };
  }

  private mapSubmissionListItemResponse(submission: SubmissionListItemPayload) {
    return {
      id: submission.id,
      assignmentId: submission.assignmentId,
      submittedByMemberId: submission.submittedByMemberId,
      submissionNote: submission.submissionNote,
      status: submission.status,
      reviewedByMemberId: submission.reviewedByMemberId,
      reviewNote: submission.reviewNote,
      submittedAt: submission.submittedAt,
      reviewedAt: submission.reviewedAt,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
      isLate: this.isSubmissionLate(submission),
      proofCount: submission._count.proofs,
      proofs: submission.proofs.map((proof) => this.mapProofResponse(proof)),
      submittedByMember: this.mapMemberSummary(submission.submittedByMember),
      reviewedByMember: this.mapMemberSummary(submission.reviewedByMember),
    };
  }

  private async mapSubmissionListItemResponseWithFreshProofUrls(
    submission: SubmissionListItemPayload,
  ) {
    const response = this.mapSubmissionListItemResponse(submission);
    return {
      ...response,
      proofs: await Promise.all(
        submission.proofs.map((proof) =>
          this.mapProofResponseWithFreshFileUrls(proof),
        ),
      ),
    };
  }

  private mapProofResponse(proof: ProofResponsePayload) {
    return {
      id: proof.id,
      submissionId: proof.submissionId,
      proofType: proof.proofType,
      fileUrl: proof.fileUrl,
      thumbnailUrl: proof.thumbnailUrl,
      note: proof.note,
      uploadedAt: proof.uploadedAt,
      createdAt: proof.createdAt,
      updatedAt: proof.updatedAt,
    };
  }

  private async mapProofResponseWithFreshFileUrls(proof: ProofResponsePayload) {
    const response = this.mapProofResponse(proof);
    return {
      ...response,
      fileUrl: await this.refreshProofFileUrl(response.fileUrl),
      thumbnailUrl: await this.refreshProofFileUrl(response.thumbnailUrl),
    };
  }

  private async refreshProofFileUrl(fileUrl: string | null) {
    if (!this.storage || !fileUrl) {
      return fileUrl;
    }

    return (
      (await this.storage.createSignedReadUrlFromStoredUrl(fileUrl)) ?? fileUrl
    );
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
