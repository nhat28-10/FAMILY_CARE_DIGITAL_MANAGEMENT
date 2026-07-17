import { ForbiddenException } from '@nestjs/common';
import {
  FamilyRole,
  MemberStatus,
  NotificationType,
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
    taskSubmission: { findMany: jest.Mock; count: jest.Mock };
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
