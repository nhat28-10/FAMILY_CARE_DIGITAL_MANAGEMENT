import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  FamilyRole,
  JoinRequestStatus,
  MemberStatus,
  Prisma,
  Relationship,
} from '@prisma/client';

import { JoinRequestsService } from './join-requests.service';

/** P2025 giả lập race: record không còn khớp where (status đã đổi). */
function notFoundError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('not found', {
    code: 'P2025',
    clientVersion: 'test',
  });
}

describe('JoinRequestsService', () => {
  const familyId = 'family-id';
  const userId = 'user-id';
  const requestId = 'request-id';
  const managerMemberId = 'manager-member-id';
  const code = 'K8ZQ4MPT';

  const family = { id: familyId, name: 'Gia đình Phan', avatarUrl: null };

  const pendingRequest = {
    id: requestId,
    familyId,
    userId,
    status: JoinRequestStatus.PENDING,
    message: null,
    decidedByMemberId: null,
    decidedAt: null,
    createdAt: new Date(),
  };

  let prisma: {
    family: Record<string, jest.Mock>;
    joinRequest: Record<string, jest.Mock>;
    familyMember: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let familyMembers: {
    findByFamilyAndUser: jest.Mock;
    assertCanAddMember: jest.Mock;
  };
  let service: JoinRequestsService;

  beforeEach(() => {
    prisma = {
      family: { findUnique: jest.fn() },
      joinRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(pendingRequest),
        update: jest.fn((args: { data: Partial<typeof pendingRequest> }) => ({
          ...pendingRequest,
          ...args.data,
        })),
      },
      familyMember: {
        create: jest.fn().mockResolvedValue({ id: 'new-member' }),
        update: jest.fn().mockResolvedValue({ id: 'reactivated-member' }),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    familyMembers = {
      findByFamilyAndUser: jest.fn().mockResolvedValue(null),
      assertCanAddMember: jest.fn().mockResolvedValue(undefined),
    };
    service = new JoinRequestsService(prisma as never, familyMembers as never);
  });

  describe('previewByCode', () => {
    it('normalize mã (lowercase + space) rồi trả family', async () => {
      prisma.family.findUnique.mockResolvedValue(family);
      await expect(service.previewByCode(' k8zq4mpt ')).resolves.toEqual({
        family,
      });
      expect(prisma.family.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { inviteCode: code } }),
      );
    });

    it('404 khi mã không tồn tại', async () => {
      prisma.family.findUnique.mockResolvedValue(null);
      await expect(service.previewByCode('XXXXXXXX')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    beforeEach(() => {
      prisma.family.findUnique.mockResolvedValue(family);
    });

    it('tạo yêu cầu PENDING kèm lời nhắn', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue(null);
      await service.create(code, userId, { message: 'Con là út' });
      expect(prisma.joinRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            familyId,
            userId,
            message: 'Con là út',
          }),
        }),
      );
    });

    it('409 khi đã là thành viên ACTIVE', async () => {
      familyMembers.findByFamilyAndUser.mockResolvedValue({
        status: MemberStatus.ACTIVE,
      });
      await expect(service.create(code, userId, {})).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('409 khi đã có yêu cầu PENDING', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue(pendingRequest);
      await expect(service.create(code, userId, {})).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('thành viên đã rời (INACTIVE) vẫn gửi yêu cầu được', async () => {
      familyMembers.findByFamilyAndUser.mockResolvedValue({
        status: MemberStatus.INACTIVE,
      });
      prisma.joinRequest.findFirst.mockResolvedValue(null);
      await expect(service.create(code, userId, {})).resolves.toBeDefined();
    });
  });

  describe('cancel', () => {
    it('chủ yêu cầu hủy khi PENDING → CANCELED', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue(pendingRequest);
      const result = await service.cancel(userId, requestId);
      expect(result.status).toBe(JoinRequestStatus.CANCELED);
      expect(prisma.joinRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: requestId, status: JoinRequestStatus.PENDING },
          data: { status: JoinRequestStatus.CANCELED },
        }),
      );
    });

    it('404 khi yêu cầu không phải của mình', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue(null);
      await expect(service.cancel(userId, requestId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('400 khi yêu cầu đã xử lý', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue({
        ...pendingRequest,
        status: JoinRequestStatus.APPROVED,
      });
      await expect(service.cancel(userId, requestId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('400 khi bị race: status đổi giữa lúc đọc và update (P2025)', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue(pendingRequest);
      prisma.joinRequest.update.mockRejectedValue(notFoundError());
      await expect(service.cancel(userId, requestId)).rejects.toMatchObject({
        message: 'Yêu cầu đã được xử lý, không thể hủy',
      });
    });
  });

  describe('approve', () => {
    beforeEach(() => {
      prisma.joinRequest.findFirst.mockResolvedValue(pendingRequest);
    });

    it('tạo member mới + đánh dấu APPROVED trong transaction', async () => {
      const member = await service.approve(
        familyId,
        managerMemberId,
        requestId,
        { familyRole: FamilyRole.DEPUTY_MEMBER },
      );
      expect(member).toEqual({ id: 'new-member' });
      expect(prisma.familyMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            familyId,
            userId,
            familyRole: FamilyRole.DEPUTY_MEMBER,
            relationship: Relationship.OTHER,
          }),
        }),
      );
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.joinRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: requestId, status: JoinRequestStatus.PENDING },
          data: expect.objectContaining({
            status: JoinRequestStatus.APPROVED,
            decidedByMemberId: managerMemberId,
          }),
        }),
      );
    });

    it('reactivate membership đã soft-remove thay vì tạo mới', async () => {
      familyMembers.findByFamilyAndUser.mockResolvedValue({
        status: MemberStatus.INACTIVE,
      });
      const member = await service.approve(
        familyId,
        managerMemberId,
        requestId,
      );
      expect(member).toEqual({ id: 'reactivated-member' });
      expect(prisma.familyMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { familyId_userId: { familyId, userId } },
          data: expect.objectContaining({
            status: MemberStatus.ACTIVE,
            leftAt: null,
          }),
        }),
      );
      expect(prisma.familyMember.create).not.toHaveBeenCalled();
    });

    it('chặn khi vượt trần thành viên của gói', async () => {
      familyMembers.assertCanAddMember.mockRejectedValue(
        new BadRequestException('Đã đạt số thành viên tối đa của gói hiện tại'),
      );
      await expect(
        service.approve(familyId, managerMemberId, requestId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('400 khi yêu cầu không còn PENDING', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue({
        ...pendingRequest,
        status: JoinRequestStatus.REJECTED,
      });
      await expect(
        service.approve(familyId, managerMemberId, requestId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 khi yêu cầu không thuộc family', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue(null);
      await expect(
        service.approve(familyId, managerMemberId, requestId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('400 khi bị race: status đổi giữa lúc đọc và duyệt (P2025)', async () => {
      prisma.$transaction.mockRejectedValue(notFoundError());
      await expect(
        service.approve(familyId, managerMemberId, requestId),
      ).rejects.toMatchObject({
        message: 'Chỉ có thể duyệt yêu cầu đang chờ',
      });
    });
  });

  describe('reject', () => {
    it('PENDING → REJECTED + ghi người quyết định', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue(pendingRequest);
      const result = await service.reject(familyId, managerMemberId, requestId);
      expect(result.status).toBe(JoinRequestStatus.REJECTED);
      expect(result.decidedByMemberId).toBe(managerMemberId);
      expect(prisma.joinRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: requestId, status: JoinRequestStatus.PENDING },
        }),
      );
    });

    it('400 khi không còn PENDING', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue({
        ...pendingRequest,
        status: JoinRequestStatus.CANCELED,
      });
      await expect(
        service.reject(familyId, managerMemberId, requestId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('400 khi bị race: status đổi giữa lúc đọc và từ chối (P2025)', async () => {
      prisma.joinRequest.findFirst.mockResolvedValue(pendingRequest);
      prisma.joinRequest.update.mockRejectedValue(notFoundError());
      await expect(
        service.reject(familyId, managerMemberId, requestId),
      ).rejects.toMatchObject({
        message: 'Chỉ có thể từ chối yêu cầu đang chờ duyệt',
      });
    });
  });
});
