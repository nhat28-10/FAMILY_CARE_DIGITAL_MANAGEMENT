import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FamilyRole, MemberStatus, NotificationType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { FamilyMembersService } from '../family-members/family-members.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SosGateway } from '../sos/sos.gateway';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { FamiliesService } from './families.service';

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
    service = new FamiliesService(
      prisma as unknown as PrismaService,
      familyMembers as unknown as FamilyMembersService,
      sosGateway as unknown as SosGateway,
      {} as unknown as SubscriptionsService,
      notifications as unknown as NotificationsService,
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
