import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  FamilyRole,
  LedgerEntryType,
  MemberStatus,
  Prisma,
  SpendingSupportRequestStatus,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SpendingSupportDecision } from '../dto/review-spending-support-request.dto';
import { FinanceService } from './finance.service';
import { SpendingSupportRequestService } from './spending-support-request.service';

describe('SpendingSupportRequestService spending support requests', () => {
  const familyId = 'family-id';
  const memberId = 'member-id';
  const reviewerId = 'reviewer-id';
  const requestId = 'request-id';
  let tx: Record<string, Record<string, jest.Mock>>;
  let prisma: Record<string, unknown>;
  let notifications: { notify: jest.Mock };
  let service: SpendingSupportRequestService;

  const activeMember = {
    id: memberId,
    familyId,
    familyRole: FamilyRole.FAMILY_MEMBER,
    status: MemberStatus.ACTIVE,
  };
  const reviewer = {
    id: reviewerId,
    familyId,
    familyRole: FamilyRole.FAMILY_MANAGER,
    status: MemberStatus.ACTIVE,
  };
  const pendingRequest = {
    id: requestId,
    familyId,
    requesterMemberId: memberId,
    categoryId: 'category-id',
    amount: new Prisma.Decimal(250000),
    purpose: 'Mua sách giáo khoa',
    status: SpendingSupportRequestStatus.PENDING,
    requesterMember: {
      displayName: 'Con',
      user: { fullName: 'Nguyen Van A' },
    },
  };

  beforeEach(() => {
    tx = {
      familyMember: { findFirst: jest.fn(), findMany: jest.fn() },
      financeCategory: { findFirst: jest.fn() },
      spendingSupportRequest: {
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      financeLedger: { upsert: jest.fn() },
      ledgerEntry: { create: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn((input: unknown) =>
        Array.isArray(input)
          ? Promise.all(input)
          : (input as (client: typeof tx) => unknown)(tx),
      ),
      familyMember: { findFirst: jest.fn(), findMany: jest.fn() },
      spendingSupportRequest: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
      },
      ledgerEntry: { findFirst: jest.fn(), aggregate: jest.fn() },
      financeLedger: { findUnique: jest.fn() },
      memberMonthlyFinance: { findUnique: jest.fn() },
    };
    (prisma.familyMember as { findMany: jest.Mock }).findMany.mockResolvedValue(
      [],
    );
    notifications = { notify: jest.fn().mockResolvedValue({ ids: [] }) };
    service = new SpendingSupportRequestService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  it('creates a pending request for an active member', async () => {
    tx.familyMember.findFirst.mockResolvedValue(activeMember);
    tx.financeCategory.findFirst.mockResolvedValue({ id: 'category-id' });
    tx.spendingSupportRequest.create.mockResolvedValue(pendingRequest);

    await service.createSpendingSupportRequest(familyId, memberId, {
      amount: 250000,
      categoryId: 'category-id',
      purpose: ' Mua sách giáo khoa ',
    });

    expect(tx.spendingSupportRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          familyId,
          requesterMemberId: memberId,
          purpose: 'Mua sách giáo khoa',
        }),
      }),
    );
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('notifies managers and deputies when a support request is created', async () => {
    tx.familyMember.findFirst.mockResolvedValue(activeMember);
    tx.spendingSupportRequest.create.mockResolvedValue(pendingRequest);
    (prisma.familyMember as { findMany: jest.Mock }).findMany.mockResolvedValue(
      [{ id: 'manager-member-id' }],
    );

    await service.createSpendingSupportRequest(familyId, memberId, {
      amount: 250000,
      purpose: 'Mua sách giáo khoa',
    });

    expect(notifications.notify).toHaveBeenCalledWith(
      familyId,
      ['manager-member-id'],
      expect.objectContaining({
        type: 'FINANCE',
        referenceType: 'SUPPORT_REQUEST',
        referenceId: requestId,
      }),
    );
  });

  it('rejects create for an inactive or missing member', async () => {
    tx.familyMember.findFirst.mockResolvedValue(null);

    await expect(
      service.createSpendingSupportRequest(familyId, memberId, {
        amount: 100,
        purpose: 'Need support',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a whitespace-only purpose', async () => {
    tx.familyMember.findFirst.mockResolvedValue(activeMember);

    await expect(
      service.createSpendingSupportRequest(familyId, memberId, {
        amount: 100,
        purpose: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('limits a normal member list to their own requests', async () => {
    (
      prisma.familyMember as { findFirst: jest.Mock }
    ).findFirst.mockResolvedValue(activeMember);
    (
      prisma.spendingSupportRequest as Record<string, jest.Mock>
    ).findMany.mockResolvedValue([]);
    (
      prisma.spendingSupportRequest as Record<string, jest.Mock>
    ).count.mockResolvedValue(0);

    await service.listSpendingSupportRequests(familyId, memberId, {
      page: 1,
      limit: 20,
      mine: false,
      requesterMemberId: 'another-member',
    });

    expect(
      (prisma.spendingSupportRequest as Record<string, jest.Mock>).findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ requesterMemberId: memberId }),
      }),
    );
  });

  it('forbids another normal member from viewing a request', async () => {
    (
      prisma.familyMember as { findFirst: jest.Mock }
    ).findFirst.mockResolvedValue({ ...activeMember, id: 'another-member' });
    (
      prisma.spendingSupportRequest as Record<string, jest.Mock>
    ).findFirst.mockResolvedValue(pendingRequest);

    await expect(
      service.getSpendingSupportRequest(familyId, 'another-member', requestId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('approves a pending request and creates one support ledger entry', async () => {
    tx.familyMember.findFirst.mockResolvedValue(reviewer);
    tx.spendingSupportRequest.findFirst
      .mockResolvedValueOnce(pendingRequest)
      .mockResolvedValueOnce({
        ...pendingRequest,
        status: SpendingSupportRequestStatus.APPROVED,
      });
    tx.spendingSupportRequest.updateMany.mockResolvedValue({ count: 1 });
    tx.financeLedger.upsert.mockResolvedValue({ id: 'ledger-id' });
    tx.ledgerEntry.create.mockResolvedValue({
      id: 'entry-id',
      entryType: LedgerEntryType.SUPPORT,
    });

    await service.reviewSpendingSupportRequest(
      familyId,
      reviewerId,
      requestId,
      { decision: SpendingSupportDecision.APPROVE },
    );

    expect(tx.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryType: LedgerEntryType.SUPPORT,
          sourceType: 'SUPPORT_REQUEST',
          sourceId: requestId,
        }),
      }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      familyId,
      [memberId],
      expect.objectContaining({
        type: 'FINANCE',
        referenceType: 'SUPPORT_REQUEST',
        referenceId: requestId,
      }),
    );
  });

  it('rejects a pending request without creating a ledger entry', async () => {
    tx.familyMember.findFirst.mockResolvedValue(reviewer);
    tx.spendingSupportRequest.findFirst
      .mockResolvedValueOnce(pendingRequest)
      .mockResolvedValueOnce({
        ...pendingRequest,
        status: SpendingSupportRequestStatus.REJECTED,
      });
    tx.spendingSupportRequest.updateMany.mockResolvedValue({ count: 1 });

    await service.reviewSpendingSupportRequest(
      familyId,
      reviewerId,
      requestId,
      { decision: SpendingSupportDecision.REJECT },
    );

    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('does not allow reviewers to review their own request', async () => {
    tx.familyMember.findFirst.mockResolvedValue(reviewer);
    tx.spendingSupportRequest.findFirst.mockResolvedValue({
      ...pendingRequest,
      requesterMemberId: reviewerId,
    });

    await expect(
      service.reviewSpendingSupportRequest(familyId, reviewerId, requestId, {
        decision: SpendingSupportDecision.APPROVE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('detects a concurrent or stale review before creating a ledger entry', async () => {
    tx.familyMember.findFirst.mockResolvedValue(reviewer);
    tx.spendingSupportRequest.findFirst.mockResolvedValue(pendingRequest);
    tx.spendingSupportRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.reviewSpendingSupportRequest(familyId, reviewerId, requestId, {
        decision: SpendingSupportDecision.APPROVE,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('lets the requester cancel a pending request without a ledger entry', async () => {
    tx.familyMember.findFirst.mockResolvedValue(activeMember);
    tx.spendingSupportRequest.findFirst
      .mockResolvedValueOnce(pendingRequest)
      .mockResolvedValueOnce({
        ...pendingRequest,
        status: SpendingSupportRequestStatus.CANCELED,
      });
    tx.spendingSupportRequest.updateMany.mockResolvedValue({ count: 1 });

    await service.cancelSpendingSupportRequest(familyId, memberId, requestId);

    expect(tx.spendingSupportRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: SpendingSupportRequestStatus.CANCELED },
      }),
    );
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('counts support entries as expenses in the legacy overview', async () => {
    (
      prisma.financeLedger as { findUnique: jest.Mock }
    ).findUnique.mockResolvedValue({
      id: 'ledger-id',
      ledgerName: 'Shared Family Ledger',
      status: 'ACTIVE',
    });
    (
      prisma.memberMonthlyFinance as { findUnique: jest.Mock }
    ).findUnique.mockResolvedValue(null);
    const aggregate = (prisma.ledgerEntry as { aggregate: jest.Mock })
      .aggregate;
    aggregate
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(1000) } })
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(250) } });
    (prisma.ledgerEntry as { count?: jest.Mock }).count = jest
      .fn()
      .mockResolvedValue(2);

    const financeService = new FinanceService(
      prisma as unknown as PrismaService,
    );

    const result = await financeService.getOverview(familyId, memberId, {
      month: 6,
      year: 2026,
    });

    expect(result.totalExpense.toNumber()).toBe(250);
    expect(aggregate.mock.calls[1][0].where.entryType.in).toContain(
      LedgerEntryType.SUPPORT,
    );
  });
});
