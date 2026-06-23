import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FamilyRole,
  InvitationStatus,
  MemberStatus,
  Relationship,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { FamilyMembersService } from '../family-members/family-members.service';
import { SafeUser } from '../users/users.types';
import { InvitationsService } from './invitations.service';

describe('InvitationsService claim/approve/reject flow', () => {
  const familyId = 'family-id';
  const invitationId = 'invitation-id';
  const approverMemberId = 'manager-member-id';
  const token = 'raw-token';

  const user = {
    id: 'user-id',
    email: 'invitee@example.com',
  } as SafeUser;

  const baseInvitation = {
    id: invitationId,
    familyId,
    email: 'invitee@example.com',
    tokenHash: 'hash',
    familyRole: FamilyRole.FAMILY_MEMBER,
    relationship: Relationship.OTHER,
    status: InvitationStatus.PENDING,
    createdByMemberId: 'creator',
    claimedById: null,
    claimedAt: null,
    approvedByMemberId: null,
    approvedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
  };

  let prisma: {
    invitation: Record<string, jest.Mock>;
    familyMember: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let familyMembers: {
    findByFamilyAndUser: jest.Mock;
    assertCanAddMember: jest.Mock;
  };
  let service: InvitationsService;

  beforeEach(() => {
    prisma = {
      invitation: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn((args) => ({ ...baseInvitation, ...args.data })),
        updateMany: jest.fn(),
      },
      familyMember: {
        create: jest.fn().mockResolvedValue({ id: 'new-member' }),
        update: jest.fn().mockResolvedValue({ id: 'reactivated-member' }),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    familyMembers = {
      findByFamilyAndUser: jest.fn(),
      assertCanAddMember: jest.fn().mockResolvedValue(undefined),
    };
    service = new InvitationsService(
      prisma as unknown as PrismaService,
      familyMembers as unknown as FamilyMembersService,
      { get: jest.fn() } as unknown as ConfigService,
    );
  });

  // --- claim ----------------------------------------------------------------

  it('claim: PENDING → CLAIMED, records claimer, does not create a member', async () => {
    prisma.invitation.findUnique.mockResolvedValue({ ...baseInvitation });
    familyMembers.findByFamilyAndUser.mockResolvedValue(null);

    const result = await service.claim(token, user);

    expect(prisma.familyMember.create).not.toHaveBeenCalled();
    const arg = prisma.invitation.update.mock.calls[0][0];
    expect(arg.data.status).toBe(InvitationStatus.CLAIMED);
    expect(arg.data.claimedById).toBe(user.id);
    expect(arg.data.claimedAt).toBeInstanceOf(Date);
    expect(result).not.toHaveProperty('tokenHash');
  });

  it('claim: throws Forbidden when email does not match', async () => {
    prisma.invitation.findUnique.mockResolvedValue({
      ...baseInvitation,
      email: 'someone-else@example.com',
    });

    await expect(service.claim(token, user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('claim: throws BadRequest when invitation is not PENDING', async () => {
    prisma.invitation.findUnique.mockResolvedValue({
      ...baseInvitation,
      status: InvitationStatus.CLAIMED,
    });

    await expect(service.claim(token, user)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('claim: throws Conflict when already an ACTIVE member', async () => {
    prisma.invitation.findUnique.mockResolvedValue({ ...baseInvitation });
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      status: MemberStatus.ACTIVE,
    });

    await expect(service.claim(token, user)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  // --- approve --------------------------------------------------------------

  it('approve: CLAIMED → APPROVED, creates member, records approver', async () => {
    prisma.invitation.findFirst.mockResolvedValue({
      ...baseInvitation,
      status: InvitationStatus.CLAIMED,
      claimedById: user.id,
    });
    familyMembers.findByFamilyAndUser.mockResolvedValue(null);

    await service.approve(familyId, approverMemberId, invitationId);

    expect(prisma.familyMember.create).toHaveBeenCalledTimes(1);
    const invArg = prisma.invitation.update.mock.calls[0][0];
    expect(invArg.data.status).toBe(InvitationStatus.APPROVED);
    expect(invArg.data.approvedByMemberId).toBe(approverMemberId);
    expect(invArg.data.approvedAt).toBeInstanceOf(Date);
  });

  it('approve: reactivates a soft-removed member instead of creating a duplicate', async () => {
    prisma.invitation.findFirst.mockResolvedValue({
      ...baseInvitation,
      status: InvitationStatus.CLAIMED,
      claimedById: user.id,
    });
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      status: MemberStatus.REMOVED,
    });

    await service.approve(familyId, approverMemberId, invitationId);

    expect(prisma.familyMember.create).not.toHaveBeenCalled();
    expect(prisma.familyMember.update).toHaveBeenCalledTimes(1);
    const memberArg = prisma.familyMember.update.mock.calls[0][0];
    expect(memberArg.data.status).toBe(MemberStatus.ACTIVE);
    expect(memberArg.data.leftAt).toBeNull();
  });

  it('approve: throws BadRequest when invitation is not CLAIMED', async () => {
    prisma.invitation.findFirst.mockResolvedValue({
      ...baseInvitation,
      status: InvitationStatus.PENDING,
    });

    await expect(
      service.approve(familyId, approverMemberId, invitationId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // --- rejectClaim ----------------------------------------------------------

  it('rejectClaim: CLAIMED → REJECTED', async () => {
    prisma.invitation.findFirst.mockResolvedValue({
      ...baseInvitation,
      status: InvitationStatus.CLAIMED,
      claimedById: user.id,
    });

    await service.rejectClaim(familyId, invitationId);

    const arg = prisma.invitation.update.mock.calls[0][0];
    expect(arg.data.status).toBe(InvitationStatus.REJECTED);
  });
});
