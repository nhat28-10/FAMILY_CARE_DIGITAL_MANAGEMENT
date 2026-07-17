import { RemindersService } from './reminders.service';

describe('RemindersService.scan', () => {
  let prisma: {
    taskAssignment: { findMany: jest.Mock; updateMany: jest.Mock };
    calendarEventParticipant: { findMany: jest.Mock; updateMany: jest.Mock };
  };
  let notifications: { notify: jest.Mock };
  let queue: { upsertJobScheduler: jest.Mock };
  let service: RemindersService;

  beforeEach(() => {
    prisma = {
      taskAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a1',
            assignedToMemberId: 'm1',
            dueAt: new Date(Date.now() + 10 * 60_000),
            task: { familyId: 'f1', title: 'Rửa bát' },
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      calendarEventParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    notifications = { notify: jest.fn().mockResolvedValue({ ids: ['n1'] }) };
    queue = { upsertJobScheduler: jest.fn() };
    service = new RemindersService(
      prisma as never,
      notifications as never,
      queue as never,
    );
  });

  it('nhắc task sắp đến hạn rồi đóng dấu reminderSentAt', async () => {
    await service.scan();
    expect(notifications.notify).toHaveBeenCalledWith(
      'f1',
      ['m1'],
      expect.objectContaining({
        referenceType: 'TASK_ASSIGNMENT',
        referenceId: 'a1',
      }),
    );
    expect(prisma.taskAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a1'] } },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it('không có gì đến hạn → không notify, không update', async () => {
    prisma.taskAssignment.findMany.mockResolvedValue([]);
    await service.scan();
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(prisma.taskAssignment.updateMany).not.toHaveBeenCalled();
  });
});
