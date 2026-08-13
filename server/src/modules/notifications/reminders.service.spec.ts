import { NotificationPriority, NotificationType } from '@prisma/client';

import { RemindersService } from './reminders.service';

describe('RemindersService.scan', () => {
  let prisma: {
    taskAssignment: { findMany: jest.Mock; update: jest.Mock };
    calendarEventParticipant: { findMany: jest.Mock; update: jest.Mock };
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
        update: jest.fn().mockResolvedValue({}),
      },
      calendarEventParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
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

  it('nhắc task sắp đến hạn rồi đóng dấu reminderSentAt từng row', async () => {
    await service.scan();
    expect(notifications.notify).toHaveBeenCalledWith(
      'f1',
      ['m1'],
      expect.objectContaining({
        referenceType: 'TASK_ASSIGNMENT',
        referenceId: 'a1',
      }),
    );
    expect(prisma.taskAssignment.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it('không có gì đến hạn → không notify, không update', async () => {
    prisma.taskAssignment.findMany.mockResolvedValue([]);
    await service.scan();
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(prisma.taskAssignment.update).not.toHaveBeenCalled();
  });

  it('notify lỗi 1 row → row đó KHÔNG đóng dấu, row sau vẫn nhắc + đóng dấu, scan không throw', async () => {
    prisma.taskAssignment.findMany.mockResolvedValue([
      {
        id: 'a1',
        assignedToMemberId: 'm1',
        dueAt: new Date(Date.now() + 10 * 60_000),
        task: { familyId: 'f1', title: 'Rửa bát' },
      },
      {
        id: 'a2',
        assignedToMemberId: 'm2',
        dueAt: new Date(Date.now() + 15 * 60_000),
        task: { familyId: 'f1', title: 'Quét nhà' },
      },
    ]);
    notifications.notify
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ ids: ['n2'] });

    await expect(service.scan()).resolves.toBeUndefined();

    expect(notifications.notify).toHaveBeenCalledTimes(2);
    expect(prisma.taskAssignment.update).toHaveBeenCalledTimes(1);
    expect(prisma.taskAssignment.update).toHaveBeenCalledWith({
      where: { id: 'a2' },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it('nhắc sự kiện lịch sắp diễn ra rồi đóng dấu reminderSentAt', async () => {
    prisma.taskAssignment.findMany.mockResolvedValue([]);
    prisma.calendarEventParticipant.findMany.mockResolvedValue([
      {
        id: 'p1',
        memberId: 'm3',
        event: { id: 'e1', workspaceId: 'f2', title: 'Họp gia đình' },
      },
    ]);

    await service.scan();

    expect(notifications.notify).toHaveBeenCalledWith(
      'f2',
      ['m3'],
      expect.objectContaining({
        type: NotificationType.CALENDAR,
        priority: NotificationPriority.HIGH,
        referenceType: 'CALENDAR_EVENT',
        referenceId: 'e1',
      }),
    );
    expect(prisma.calendarEventParticipant.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: { reminderSentAt: expect.any(Date) },
    });
  });
});
