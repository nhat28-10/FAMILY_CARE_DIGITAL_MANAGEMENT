import { ForbiddenException } from '@nestjs/common';
import {
  FamilyRole,
  MemberStatus,
  NotificationType,
  RewardType,
  TaskAssignmentStatus,
  TaskPriority,
  TaskProofType,
  TaskStatus,
  TaskSubmissionStatus,
  TaskType,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { TasksService } from './tasks.service';

describe('TasksService listTaskSubmissions', () => {
  const familyId = 'family-id';
  const assignmentId = 'assignment-id';
  const memberId = 'member-id';
  const submittedAt = new Date('2026-07-01T08:00:00.000Z');
  const createdAt = new Date('2026-07-01T08:01:00.000Z');
  const updatedAt = new Date('2026-07-01T08:02:00.000Z');

  let prisma: {
    $transaction: jest.Mock;
    task: { findFirst: jest.Mock };
    familyMember: { findFirst: jest.Mock };
    taskAssignment: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    taskSubmission: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let notifications: {
    notify: jest.Mock;
    notifyUsersEphemeral: jest.Mock;
    dispatch: jest.Mock;
  };
  let service: TasksService;

  const memberSummary = (id: string) => ({
    id,
    userId: `${id}-user`,
    familyRole: FamilyRole.FAMILY_MEMBER,
    status: MemberStatus.ACTIVE,
    user: {
      id: `${id}-user`,
      fullName: `${id} name`,
      avatarUrl: null,
    },
  });

  const proof = (
    id: string,
    uploadedAt: Date,
    proofType: TaskProofType = TaskProofType.IMAGE,
  ) => ({
    id,
    submissionId: 'submission-with-proofs',
    proofType,
    fileUrl: `https://example.com/${id}`,
    thumbnailUrl: `https://example.com/${id}-thumb`,
    note: `${id} note`,
    uploadedAt,
    createdAt: uploadedAt,
    updatedAt: uploadedAt,
  });

  const submission = (
    id: string,
    proofs: ReturnType<typeof proof>[],
    status: TaskSubmissionStatus = TaskSubmissionStatus.WAITING_REVIEW,
  ) => ({
    id,
    assignmentId,
    submittedByMemberId: memberId,
    submissionNote: `${id} note`,
    status,
    reviewedByMemberId: null,
    reviewNote: null,
    submittedAt,
    reviewedAt: null,
    createdAt,
    updatedAt,
    assignment: {
      assignedToMemberId: memberId,
      dueAt: null,
    },
    submittedByMember: memberSummary(memberId),
    reviewedByMember: null,
    proofs,
    _count: {
      proofs: proofs.length,
    },
  });

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
      task: {
        findFirst: jest.fn(),
      },
      familyMember: {
        findFirst: jest.fn(),
      },
      taskAssignment: {
        findFirst: jest.fn().mockResolvedValue({
          id: assignmentId,
          assignedToMemberId: memberId,
        }),
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      taskSubmission: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    notifications = {
      notify: jest.fn().mockResolvedValue({ ids: [] }),
      notifyUsersEphemeral: jest.fn().mockResolvedValue(undefined),
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    service = new TasksService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  it('returns an empty proofs array and proofCount 0 when a submission has no proofs', async () => {
    prisma.taskSubmission.findMany.mockResolvedValue([
      submission('submission-without-proofs', []),
    ]);
    prisma.taskSubmission.count.mockResolvedValue(1);

    const result = await service.listTaskSubmissions(
      familyId,
      assignmentId,
      memberId,
      FamilyRole.FAMILY_MEMBER,
      { page: 1, limit: 20 },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'submission-without-proofs',
      proofCount: 0,
      proofs: [],
    });
  });

  it('returns proof metadata in uploadedAt ascending order and keeps proofCount aligned', async () => {
    const proofs = [
      proof('proof-1', new Date('2026-07-01T08:03:00.000Z')),
      proof(
        'proof-2',
        new Date('2026-07-01T08:04:00.000Z'),
        TaskProofType.VIDEO,
      ),
      proof(
        'proof-3',
        new Date('2026-07-01T08:05:00.000Z'),
        TaskProofType.FILE,
      ),
    ];
    prisma.taskSubmission.findMany.mockResolvedValue([
      submission('submission-with-proofs', proofs),
    ]);
    prisma.taskSubmission.count.mockResolvedValue(1);

    const result = await service.listTaskSubmissions(
      familyId,
      assignmentId,
      memberId,
      FamilyRole.FAMILY_MEMBER,
      { page: 1, limit: 20 },
    );

    expect(result.items[0].proofCount).toBe(result.items[0].proofs.length);
    expect(result.items[0].proofs.map((item) => item.id)).toEqual([
      'proof-1',
      'proof-2',
      'proof-3',
    ]);
    expect(result.items[0].proofs).toEqual(
      proofs.map((item) => ({
        id: item.id,
        submissionId: item.submissionId,
        proofType: item.proofType,
        fileUrl: item.fileUrl,
        thumbnailUrl: item.thumbnailUrl,
        note: item.note,
        uploadedAt: item.uploadedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    );
  });

  it('keeps pagination, status filtering, proof count, and proof ordering in the Prisma query', async () => {
    prisma.taskSubmission.findMany.mockResolvedValue([]);
    prisma.taskSubmission.count.mockResolvedValue(0);

    const result = await service.listTaskSubmissions(
      familyId,
      assignmentId,
      memberId,
      FamilyRole.FAMILY_MANAGER,
      {
        page: 2,
        limit: 5,
        status: TaskSubmissionStatus.APPROVED,
      },
    );

    expect(result).toMatchObject({
      items: [],
      total: 0,
      page: 2,
      limit: 5,
      totalPages: 0,
    });
    expect(prisma.taskSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assignmentId,
          status: TaskSubmissionStatus.APPROVED,
        },
        orderBy: { submittedAt: 'desc' },
        skip: 5,
        take: 5,
        select: expect.objectContaining({
          proofs: {
            select: expect.any(Object),
            orderBy: { uploadedAt: 'asc' },
          },
          _count: {
            select: {
              proofs: true,
            },
          },
        }),
      }),
    );
    expect(prisma.taskSubmission.count).toHaveBeenCalledWith({
      where: {
        assignmentId,
        status: TaskSubmissionStatus.APPROVED,
      },
    });
  });

  it('rejects a normal member who cannot view the assignment before querying submissions', async () => {
    prisma.taskAssignment.findFirst.mockResolvedValue({
      id: assignmentId,
      assignedToMemberId: 'other-member-id',
    });

    await expect(
      service.listTaskSubmissions(
        familyId,
        assignmentId,
        memberId,
        FamilyRole.FAMILY_MEMBER,
        { page: 1, limit: 20 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.taskSubmission.findMany).not.toHaveBeenCalled();
    expect(prisma.taskSubmission.count).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refreshes signed proof URLs when returning submission detail', async () => {
    const expiredUrl =
      'https://r2.example.com/bucket/task-proofs/family-id/proof.jpg?X-Amz-Signature=old';
    const localUrl = '/uploads/task-proofs/family-id/local.jpg';
    const storage = {
      createSignedReadUrlFromStoredUrl: jest
        .fn()
        .mockImplementation((url: string) =>
          url === expiredUrl
            ? Promise.resolve('https://signed.example/fresh')
            : null,
        ),
    };
    service = new TasksService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      storage as never,
    );
    prisma.taskSubmission.findFirst.mockResolvedValue(
      submission('submission-with-proofs', [
        { ...proof('proof-1', submittedAt), fileUrl: expiredUrl },
        { ...proof('proof-2', submittedAt), fileUrl: localUrl },
      ]),
    );

    const result = await service.getTaskSubmission(
      familyId,
      'submission-with-proofs',
      memberId,
      FamilyRole.FAMILY_MEMBER,
    );

    expect(storage.createSignedReadUrlFromStoredUrl).toHaveBeenCalledWith(
      expiredUrl,
    );
    expect(storage.createSignedReadUrlFromStoredUrl).toHaveBeenCalledWith(
      localUrl,
    );
    expect(result.proofs[0].fileUrl).toBe('https://signed.example/fresh');
    expect(result.proofs[1].fileUrl).toBe(localUrl);
  });
});

describe('TasksService createTaskAssignment', () => {
  const familyId = 'family-id';
  const taskId = 'task-id';
  const assignedByMemberId = 'manager-member-id';
  const assignedToMemberId = 'assigned-manager-member-id';
  const now = new Date('2026-07-01T08:00:00.000Z');

  let prisma: {
    task: { findFirst: jest.Mock };
    familyMember: { findFirst: jest.Mock };
    taskAssignment: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
  };
  let service: TasksService;

  const memberSummary = (id: string, familyRole: FamilyRole) => ({
    id,
    userId: `${id}-user`,
    familyRole,
    status: MemberStatus.ACTIVE,
    user: {
      id: `${id}-user`,
      fullName: `${id} name`,
      avatarUrl: null,
    },
  });

  const assignmentResponse = () => ({
    id: 'assignment-id',
    taskId,
    assignedToMemberId,
    assignedByMemberId,
    status: TaskAssignmentStatus.ASSIGNED,
    assignedAt: now,
    startAt: null,
    dueAt: null,
    createdAt: now,
    updatedAt: now,
    assignedToMember: memberSummary(
      assignedToMemberId,
      FamilyRole.FAMILY_MANAGER,
    ),
    assignedByMember: memberSummary(
      assignedByMemberId,
      FamilyRole.FAMILY_MANAGER,
    ),
  });

  beforeEach(() => {
    prisma = {
      task: {
        findFirst: jest.fn().mockResolvedValue({
          id: taskId,
          familyId,
          taskType: TaskType.AD_HOC,
          status: TaskStatus.ACTIVE,
          priority: TaskPriority.MEDIUM,
        }),
      },
      familyMember: {
        findFirst: jest.fn().mockResolvedValue({
          id: assignedToMemberId,
          familyId,
          familyRole: FamilyRole.FAMILY_MANAGER,
          status: MemberStatus.ACTIVE,
        }),
      },
      taskAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'assignment-id' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(assignmentResponse()),
      },
    };
    service = new TasksService(
      prisma as unknown as PrismaService,
      {
        notify: jest.fn().mockResolvedValue({ ids: [] }),
        notifyUsersEphemeral: jest.fn().mockResolvedValue(undefined),
        dispatch: jest.fn().mockResolvedValue(undefined),
      } as unknown as NotificationsService,
    );
  });

  it('assigns an ad hoc task to an active family member by FamilyMember id regardless of role', async () => {
    const result = await service.createTaskAssignment(
      familyId,
      taskId,
      assignedByMemberId,
      { assignedToMemberId },
    );

    expect(prisma.familyMember.findFirst).toHaveBeenCalledWith({
      where: {
        id: assignedToMemberId,
        familyId,
        status: MemberStatus.ACTIVE,
      },
    });
    expect(prisma.familyMember.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: assignedToMemberId,
        }),
      }),
    );
    expect(prisma.taskAssignment.create).toHaveBeenCalledWith({
      data: {
        taskId,
        assignedToMemberId,
        assignedByMemberId,
        startAt: undefined,
        dueAt: undefined,
      },
    });
    expect(result.assignedToMemberId).toBe(assignedToMemberId);
    expect(result.assignedToMember?.familyRole).toBe(FamilyRole.FAMILY_MANAGER);
  });
});

describe('TasksService createTaskSubmission', () => {
  const familyId = 'family-id';
  const assignmentId = 'assignment-id';
  const memberId = 'member-id';

  let tx: {
    taskAssignment: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    taskSubmission: {
      create: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
  };
  let prisma: {
    $transaction: jest.Mock;
  };
  let service: TasksService;

  beforeEach(() => {
    tx = {
      taskAssignment: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      taskSubmission: {
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    };
    prisma = {
      $transaction: jest.fn((callback: (txArg: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    service = new TasksService(
      prisma as unknown as PrismaService,
      {
        notify: jest.fn().mockResolvedValue({ ids: [] }),
        notifyUsersEphemeral: jest.fn().mockResolvedValue(undefined),
        dispatch: jest.fn().mockResolvedValue(undefined),
      } as unknown as NotificationsService,
    );
  });

  it('rejects submission when the assignment is past due', async () => {
    tx.taskAssignment.findFirst.mockResolvedValue({
      assignedToMemberId: memberId,
      status: TaskAssignmentStatus.IN_PROGRESS,
      dueAt: new Date(Date.now() - 60_000),
    });

    await expect(
      service.createTaskSubmission(familyId, assignmentId, memberId, {
        proofs: [
          {
            proofType: TaskProofType.NOTE,
            note: 'Da hoan thanh',
          },
        ],
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'SUBMISSION_OVERDUE',
        errorCode: 'SUBMISSION_OVERDUE',
      },
    });

    expect(tx.taskSubmission.create).not.toHaveBeenCalled();
    expect(tx.taskAssignment.update).not.toHaveBeenCalled();
  });
});

describe('TasksService updateTaskAssignment', () => {
  const familyId = 'family-id';
  const assignmentId = 'assignment-id';
  const taskId = 'task-id';
  const startAt = new Date('2026-08-20T08:00:00.000Z');
  const dueAt = new Date('2026-08-20T10:00:00.000Z');
  const extendedDueAt = new Date('2026-08-21T10:00:00.000Z');

  let prisma: {
    taskAssignment: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: TasksService;

  const assignment = (overrides: Record<string, unknown> = {}) => ({
    id: assignmentId,
    taskId,
    assignedToMemberId: 'member-id',
    assignedByMemberId: 'manager-id',
    status: TaskAssignmentStatus.IN_PROGRESS,
    assignedAt: new Date('2026-08-20T07:00:00.000Z'),
    startAt,
    dueAt,
    createdAt: new Date('2026-08-20T07:00:00.000Z'),
    updatedAt: new Date('2026-08-20T07:00:00.000Z'),
    assignedToMember: null,
    assignedByMember: null,
    task: {
      id: taskId,
      familyId,
      taskCategoryId: null,
      title: 'Wash dishes',
      taskType: TaskType.AD_HOC,
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.ACTIVE,
      dueAt: null,
      category: null,
    },
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      taskAssignment: {
        findFirst: jest.fn().mockResolvedValue(assignment()),
        update: jest.fn().mockResolvedValue(
          assignment({
            dueAt: extendedDueAt,
            updatedAt: new Date('2026-08-20T08:30:00.000Z'),
          }),
        ),
      },
    };
    service = new TasksService(
      prisma as unknown as PrismaService,
      {
        notify: jest.fn().mockResolvedValue({ ids: [] }),
        notifyUsersEphemeral: jest.fn().mockResolvedValue(undefined),
        dispatch: jest.fn().mockResolvedValue(undefined),
      } as unknown as NotificationsService,
    );
  });

  it('extends the current assignment without changing assignee or status', async () => {
    const result = await service.updateTaskAssignment(
      familyId,
      assignmentId,
      'manager-id',
      FamilyRole.FAMILY_MANAGER,
      {
        dueAt: extendedDueAt.toISOString(),
      },
    );

    expect(prisma.taskAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: assignmentId },
        data: {
          startAt: undefined,
          dueAt: extendedDueAt,
        },
      }),
    );
    expect(result).toMatchObject({
      id: assignmentId,
      assignedToMemberId: 'member-id',
      status: TaskAssignmentStatus.IN_PROGRESS,
      dueAt: extendedDueAt,
    });
  });

  it('rejects deputy self extension for their own assignment', async () => {
    prisma.taskAssignment.findFirst.mockResolvedValue(
      assignment({
        assignedToMemberId: 'deputy-id',
      }),
    );

    await expect(
      service.updateTaskAssignment(
        familyId,
        assignmentId,
        'deputy-id',
        FamilyRole.DEPUTY_MEMBER,
        {
          dueAt: extendedDueAt.toISOString(),
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.taskAssignment.update).not.toHaveBeenCalled();
  });
});

describe('TasksService reward setting settlement backfill', () => {
  const familyId = 'family-id';
  const taskId = 'task-id';

  let tx: {
    rewardSetting: {
      create: jest.Mock;
      update: jest.Mock;
    };
    taskSubmission: {
      findMany: jest.Mock;
    };
    rewardSettlement: {
      createMany: jest.Mock;
    };
  };
  let prisma: {
    $transaction: jest.Mock;
    task: { findFirst: jest.Mock };
  };
  let service: TasksService;

  beforeEach(() => {
    tx = {
      rewardSetting: {
        create: jest.fn().mockResolvedValue({
          id: 'reward-setting-id',
          taskId,
          rewardType: RewardType.MONEY_RECORD,
          rewardAmount: 50000,
          rewardDescription: null,
          autoCreateSettlement: true,
          createdAt: new Date('2026-08-20T00:00:00.000Z'),
          updatedAt: new Date('2026-08-20T00:00:00.000Z'),
        }),
        update: jest.fn(),
      },
      taskSubmission: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'submission-id',
            submittedByMemberId: 'member-id',
            assignment: { assignedToMemberId: 'member-id' },
          },
        ]),
      },
      rewardSettlement: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma = {
      $transaction: jest.fn((callback: (txArg: typeof tx) => unknown) =>
        callback(tx),
      ),
      task: {
        findFirst: jest.fn().mockResolvedValue({
          id: taskId,
          status: TaskStatus.COMPLETED,
          rewardSetting: null,
        }),
      },
    };
    service = new TasksService(
      prisma as unknown as PrismaService,
      {
        notify: jest.fn().mockResolvedValue({ ids: [] }),
        notifyUsersEphemeral: jest.fn().mockResolvedValue(undefined),
        dispatch: jest.fn().mockResolvedValue(undefined),
      } as unknown as NotificationsService,
    );
  });

  it('backfills settlements for already-approved submissions when auto create is enabled', async () => {
    await service.createRewardSetting(familyId, taskId, 'manager-id', {
      rewardType: RewardType.MONEY_RECORD,
      rewardAmount: 50000,
      autoCreateSettlement: true,
    });

    expect(tx.taskSubmission.findMany).toHaveBeenCalledWith({
      where: {
        status: TaskSubmissionStatus.APPROVED,
        rewardSettlement: { is: null },
        assignment: { taskId },
      },
      select: {
        id: true,
        submittedByMemberId: true,
        assignment: {
          select: {
            assignedToMemberId: true,
          },
        },
      },
    });
    expect(tx.rewardSettlement.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            taskSubmissionId: 'submission-id',
            rewardSettingId: 'reward-setting-id',
            receiverMemberId: 'member-id',
            amount: 50000,
          }),
        ],
        skipDuplicates: true,
      }),
    );
  });
});

describe('TasksService createTaskAssignment', () => {
  const familyId = 'family-id';
  const taskId = 'task-id';
  const assignedByMemberId = 'manager-id';
  const assignedToMemberId = 'member-id';
  const assignmentId = 'assignment-id';

  let prisma: {
    task: { findFirst: jest.Mock };
    familyMember: { findFirst: jest.Mock };
    taskAssignment: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
  };
  let notifications: {
    notify: jest.Mock;
    notifyUsersEphemeral: jest.Mock;
    dispatch: jest.Mock;
  };
  let service: TasksService;

  beforeEach(() => {
    prisma = {
      task: {
        findFirst: jest.fn().mockResolvedValue({
          id: taskId,
          familyId,
          title: 'Rửa chén',
          taskType: TaskType.AD_HOC,
          status: TaskStatus.ACTIVE,
        }),
      },
      familyMember: {
        findFirst: jest.fn().mockResolvedValue({
          id: assignedToMemberId,
          familyId,
          status: MemberStatus.ACTIVE,
          familyRole: FamilyRole.FAMILY_MEMBER,
        }),
      },
      taskAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: assignmentId }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: assignmentId,
          taskId,
          assignedToMemberId,
          assignedByMemberId,
          status: 'ASSIGNED',
          assignedAt: new Date('2026-07-16T08:00:00.000Z'),
          startAt: null,
          dueAt: null,
          createdAt: new Date('2026-07-16T08:00:00.000Z'),
          updatedAt: new Date('2026-07-16T08:00:00.000Z'),
          assignedToMember: null,
          assignedByMember: null,
        }),
      },
    };
    notifications = {
      notify: jest.fn().mockResolvedValue({ ids: [] }),
      notifyUsersEphemeral: jest.fn().mockResolvedValue(undefined),
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    service = new TasksService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  it('notifies the assignee with a TASK notification after creating an assignment', async () => {
    await service.createTaskAssignment(familyId, taskId, assignedByMemberId, {
      assignedToMemberId,
    });

    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith(
      familyId,
      [assignedToMemberId],
      expect.objectContaining({
        type: NotificationType.TASK,
        referenceType: 'TASK_ASSIGNMENT',
        referenceId: assignmentId,
      }),
    );
  });

  it('still returns the created assignment even if notify fails (best-effort, does not undo the persisted write)', async () => {
    notifications.notify.mockRejectedValue(new Error('Redis down'));

    const assignment = await service.createTaskAssignment(
      familyId,
      taskId,
      assignedByMemberId,
      { assignedToMemberId },
    );

    expect(assignment).toMatchObject({ id: assignmentId });
  });
});
