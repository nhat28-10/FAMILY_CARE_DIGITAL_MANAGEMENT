import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FamilyRole,
  MemberStatus,
  NotificationType,
  Relationship,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { FamilyMembersService } from '../family-members/family-members.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SosGateway } from '../sos/sos.gateway';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { FamiliesService, RELATIONSHIP_ERROR_CODES } from './families.service';

describe('FamiliesService.removeMember (soft delete)', () => {
  const familyId = 'family-id';
  const userId = 'user-id';
  const removedMemberId = 'removed-member-id';
  const managerMemberId = 'manager-member-id';
  let prisma: { familyMember: Record<string, jest.Mock> };
  let familyMembers: { findByFamilyAndUser: jest.Mock; remove: jest.Mock };
  let sosGateway: { kickMemberFromWorkspace: jest.Mock };
  let notifications: { notify: jest.Mock; notifyUsersEphemeral: jest.Mock };
  let service: FamiliesService;

  beforeEach(() => {
    prisma = {
      familyMember: { findMany: jest.fn().mockResolvedValue([]) },
    };
    familyMembers = {
      findByFamilyAndUser: jest.fn(),
      remove: jest.fn().mockResolvedValue({ id: removedMemberId }),
    };
    sosGateway = { kickMemberFromWorkspace: jest.fn() };
    notifications = {
      notify: jest.fn().mockResolvedValue({ ids: [] }),
      notifyUsersEphemeral: jest.fn().mockResolvedValue(undefined),
    };
    const config = { get: jest.fn().mockReturnValue(2) };
    service = new FamiliesService(
      prisma as unknown as PrismaService,
      familyMembers as unknown as FamilyMembersService,
      sosGateway as unknown as SosGateway,
      {} as unknown as SubscriptionsService,
      notifications as unknown as NotificationsService,
      config as unknown as ConfigService,
    );
  });

  it('soft-removes an ACTIVE member and evicts them from the SOS room', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      familyRole: FamilyRole.FAMILY_MEMBER,
      status: MemberStatus.ACTIVE,
    });

    await service.removeMember(familyId, userId);

    expect(familyMembers.remove).toHaveBeenCalledWith(familyId, userId);
    expect(sosGateway.kickMemberFromWorkspace).toHaveBeenCalledWith(
      userId,
      familyId,
    );
  });

  it('notifies remaining managers/deputies (persist) and the removed user (ephemeral)', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      familyRole: FamilyRole.FAMILY_MEMBER,
      status: MemberStatus.ACTIVE,
    });
    prisma.familyMember.findMany.mockResolvedValue([{ id: managerMemberId }]);

    await service.removeMember(familyId, userId);

    expect(notifications.notify).toHaveBeenCalledWith(
      familyId,
      [managerMemberId],
      expect.objectContaining({
        type: NotificationType.MEMBER,
        referenceType: 'FAMILY_MEMBER',
        referenceId: removedMemberId,
      }),
    );
    expect(notifications.notifyUsersEphemeral).toHaveBeenCalledWith(
      [userId],
      expect.objectContaining({
        type: NotificationType.MEMBER,
        referenceType: 'FAMILY',
        referenceId: familyId,
      }),
    );
  });

  it('throws NotFound when the member does not exist', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue(null);

    await expect(service.removeMember(familyId, userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(familyMembers.remove).not.toHaveBeenCalled();
  });

  it('throws NotFound when the member is already REMOVED', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      familyRole: FamilyRole.FAMILY_MEMBER,
      status: MemberStatus.REMOVED,
    });

    await expect(service.removeMember(familyId, userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(familyMembers.remove).not.toHaveBeenCalled();
  });

  it('refuses to remove a FAMILY_MANAGER', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });

    await expect(service.removeMember(familyId, userId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(familyMembers.remove).not.toHaveBeenCalled();
  });
});

describe('FamiliesService.changeMemberRole', () => {
  const familyId = 'family-id';
  const targetUserId = 'target-user-id';
  const targetMemberId = 'target-member-id';
  const memberUserSelect = {
    id: true,
    email: true,
    fullName: true,
    avatarUrl: true,
    userType: true,
  } as const;
  let prisma: { familyMember: Record<string, jest.Mock> };
  let familyMembers: { findByFamilyAndUser: jest.Mock };
  let notifications: { notify: jest.Mock };
  let config: { get: jest.Mock };
  let service: FamiliesService;

  beforeEach(() => {
    prisma = {
      familyMember: {
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({
          id: targetMemberId,
          familyRole: FamilyRole.DEPUTY_MEMBER,
          user: { id: targetUserId },
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: targetMemberId,
          familyRole: FamilyRole.DEPUTY_MEMBER,
          user: { id: targetUserId },
        }),
      },
    };
    familyMembers = { findByFamilyAndUser: jest.fn() };
    notifications = { notify: jest.fn().mockResolvedValue({ ids: [] }) };
    config = { get: jest.fn().mockReturnValue(2) };
    service = new FamiliesService(
      prisma as unknown as PrismaService,
      familyMembers as unknown as FamilyMembersService,
      {} as unknown as SosGateway,
      {} as unknown as SubscriptionsService,
      notifications as unknown as NotificationsService,
      config as unknown as ConfigService,
    );
  });

  it('promotes an ACTIVE FAMILY_MEMBER to DEPUTY_MEMBER and notifies them', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      id: targetMemberId,
      familyRole: FamilyRole.FAMILY_MEMBER,
      status: MemberStatus.ACTIVE,
    });

    await service.changeMemberRole(
      familyId,
      targetUserId,
      FamilyRole.DEPUTY_MEMBER,
    );

    expect(prisma.familyMember.update).toHaveBeenCalledWith({
      where: { familyId_userId: { familyId, userId: targetUserId } },
      data: { familyRole: FamilyRole.DEPUTY_MEMBER },
      include: { user: { select: memberUserSelect } },
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      familyId,
      [targetMemberId],
      expect.objectContaining({
        type: NotificationType.MEMBER,
        referenceType: 'FAMILY_MEMBER',
        referenceId: targetMemberId,
      }),
    );
  });

  it('throws BadRequest when deputy cap is reached', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      id: targetMemberId,
      familyRole: FamilyRole.FAMILY_MEMBER,
      status: MemberStatus.ACTIVE,
    });
    prisma.familyMember.count.mockResolvedValue(2);

    await expect(
      service.changeMemberRole(
        familyId,
        targetUserId,
        FamilyRole.DEPUTY_MEMBER,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.familyMember.update).not.toHaveBeenCalled();
  });

  it('throws BadRequest when target is the FAMILY_MANAGER', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      id: targetMemberId,
      familyRole: FamilyRole.FAMILY_MANAGER,
      status: MemberStatus.ACTIVE,
    });

    await expect(
      service.changeMemberRole(
        familyId,
        targetUserId,
        FamilyRole.DEPUTY_MEMBER,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.familyMember.update).not.toHaveBeenCalled();
  });

  it('throws NotFound when target is missing or not ACTIVE', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue(null);

    await expect(
      service.changeMemberRole(
        familyId,
        targetUserId,
        FamilyRole.DEPUTY_MEMBER,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.familyMember.update).not.toHaveBeenCalled();
  });

  it('throws NotFound when target member is REMOVED', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      id: targetMemberId,
      familyRole: FamilyRole.FAMILY_MEMBER,
      status: MemberStatus.REMOVED,
    });

    await expect(
      service.changeMemberRole(
        familyId,
        targetUserId,
        FamilyRole.DEPUTY_MEMBER,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.familyMember.update).not.toHaveBeenCalled();
  });

  it('is idempotent when the member already has the target role', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      id: targetMemberId,
      familyRole: FamilyRole.DEPUTY_MEMBER,
      status: MemberStatus.ACTIVE,
    });

    const result = await service.changeMemberRole(
      familyId,
      targetUserId,
      FamilyRole.DEPUTY_MEMBER,
    );

    expect(prisma.familyMember.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { familyId_userId: { familyId, userId: targetUserId } },
      include: { user: { select: memberUserSelect } },
    });
    expect(result).toEqual(
      expect.objectContaining({ id: targetMemberId, user: expect.anything() }),
    );
    expect(prisma.familyMember.update).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});

describe('FamiliesService.changeMemberRelationship', () => {
  const familyId = 'family-id';
  const targetUserId = 'target-user-id';
  const targetMemberId = 'target-member-id';
  const memberUserSelect = {
    id: true,
    email: true,
    fullName: true,
    avatarUrl: true,
    userType: true,
  } as const;
  let prisma: { familyMember: Record<string, jest.Mock> };
  let familyMembers: { findByFamilyAndUser: jest.Mock };
  let service: FamiliesService;

  beforeEach(() => {
    prisma = {
      familyMember: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({
          id: targetMemberId,
          relationship: Relationship.FATHER,
          user: { id: targetUserId },
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: targetMemberId,
          relationship: Relationship.FATHER,
          user: { id: targetUserId },
        }),
      },
    };
    familyMembers = { findByFamilyAndUser: jest.fn() };
    service = new FamiliesService(
      prisma as unknown as PrismaService,
      familyMembers as unknown as FamilyMembersService,
      {} as unknown as SosGateway,
      {} as unknown as SubscriptionsService,
      { notify: jest.fn() } as unknown as NotificationsService,
      { get: jest.fn() } as unknown as ConfigService,
    );
  });

  it('updates relationship for an active member', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      id: targetMemberId,
      relationship: Relationship.OTHER,
      status: MemberStatus.ACTIVE,
    });

    await service.changeMemberRelationship(
      familyId,
      targetUserId,
      Relationship.FATHER,
    );

    expect(prisma.familyMember.update).toHaveBeenCalledWith({
      where: { familyId_userId: { familyId, userId: targetUserId } },
      data: { relationship: Relationship.FATHER },
      include: { user: { select: memberUserSelect } },
    });
  });

  it('rejects a second active father with a stable error code', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      id: targetMemberId,
      relationship: Relationship.OTHER,
      status: MemberStatus.ACTIVE,
    });
    prisma.familyMember.findFirst.mockResolvedValue({ id: 'existing-father' });

    let error: ConflictException | undefined;
    try {
      await service.changeMemberRelationship(
        familyId,
        targetUserId,
        Relationship.FATHER,
      );
    } catch (err) {
      error = err as ConflictException;
    }

    expect(error).toBeInstanceOf(ConflictException);
    expect(error?.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error?.getResponse()).toMatchObject({
      message: 'Gia đình đã có người giữ vai trò Bố',
      code: RELATIONSHIP_ERROR_CODES.FAMILY_ALREADY_HAS_FATHER,
      errorCode: RELATIONSHIP_ERROR_CODES.FAMILY_ALREADY_HAS_FATHER,
    });
    expect(prisma.familyMember.update).not.toHaveBeenCalled();
  });

  it('rejects a second active mother with a stable error code', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      id: targetMemberId,
      relationship: Relationship.OTHER,
      status: MemberStatus.ACTIVE,
    });
    prisma.familyMember.findFirst.mockResolvedValue({ id: 'existing-mother' });

    await expect(
      service.changeMemberRelationship(
        familyId,
        targetUserId,
        Relationship.MOTHER,
      ),
    ).rejects.toMatchObject({
      response: {
        message: 'Gia đình đã có người giữ vai trò Mẹ',
        code: RELATIONSHIP_ERROR_CODES.FAMILY_ALREADY_HAS_MOTHER,
        errorCode: RELATIONSHIP_ERROR_CODES.FAMILY_ALREADY_HAS_MOTHER,
      },
    });
    expect(prisma.familyMember.update).not.toHaveBeenCalled();
  });

  it('allows multiple grandparents', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      id: targetMemberId,
      relationship: Relationship.OTHER,
      status: MemberStatus.ACTIVE,
    });

    await service.changeMemberRelationship(
      familyId,
      targetUserId,
      Relationship.GRANDPARENT,
    );

    expect(prisma.familyMember.findFirst).not.toHaveBeenCalled();
    expect(prisma.familyMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { relationship: Relationship.GRANDPARENT },
      }),
    );
  });
});

describe('FamiliesService.transferOwnership', () => {
  const familyId = 'family-id';
  const managerUserId = 'manager-user-id';
  const targetUserId = 'target-user-id';
  const newManagerMemberId = 'new-manager-member-id';
  const oldManagerMemberId = 'old-manager-member-id';
  let prisma: {
    familyMember: Record<string, jest.Mock>;
    family: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let familyMembers: { findByFamilyAndUser: jest.Mock };
  let notifications: { notify: jest.Mock };
  let service: FamiliesService;

  beforeEach(() => {
    prisma = {
      familyMember: { update: jest.fn() },
      family: {
        findUnique: jest.fn().mockResolvedValue({ id: familyId, members: [] }),
      },
      $transaction: jest
        .fn()
        .mockResolvedValue([
          { id: newManagerMemberId },
          { id: oldManagerMemberId },
        ]),
    };
    familyMembers = { findByFamilyAndUser: jest.fn() };
    notifications = { notify: jest.fn().mockResolvedValue({ ids: [] }) };
    service = new FamiliesService(
      prisma as unknown as PrismaService,
      familyMembers as unknown as FamilyMembersService,
      {} as unknown as SosGateway,
      {} as unknown as SubscriptionsService,
      notifications as unknown as NotificationsService,
      { get: jest.fn() } as unknown as ConfigService,
    );
  });

  it('swaps roles atomically and notifies both parties', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue({
      id: newManagerMemberId,
      familyRole: FamilyRole.FAMILY_MEMBER,
      status: MemberStatus.ACTIVE,
    });

    await service.transferOwnership(familyId, managerUserId, targetUserId);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith(
      familyId,
      [newManagerMemberId],
      expect.objectContaining({ type: NotificationType.MEMBER }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      familyId,
      [oldManagerMemberId],
      expect.objectContaining({ type: NotificationType.MEMBER }),
    );
  });

  it('throws BadRequest when transferring to self', async () => {
    await expect(
      service.transferOwnership(familyId, managerUserId, managerUserId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws NotFound when target is missing or not ACTIVE', async () => {
    familyMembers.findByFamilyAndUser.mockResolvedValue(null);

    await expect(
      service.transferOwnership(familyId, managerUserId, targetUserId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
