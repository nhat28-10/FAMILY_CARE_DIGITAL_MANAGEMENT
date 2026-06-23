import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FamilyRole, MemberStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { FamilyMembersService } from '../family-members/family-members.service';
import { SosGateway } from '../sos/sos.gateway';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { FamiliesService } from './families.service';

describe('FamiliesService.removeMember (soft delete)', () => {
  const familyId = 'family-id';
  const userId = 'user-id';
  let familyMembers: { findByFamilyAndUser: jest.Mock; remove: jest.Mock };
  let sosGateway: { kickMemberFromWorkspace: jest.Mock };
  let service: FamiliesService;

  beforeEach(() => {
    familyMembers = {
      findByFamilyAndUser: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    sosGateway = { kickMemberFromWorkspace: jest.fn() };
    service = new FamiliesService(
      {} as unknown as PrismaService,
      familyMembers as unknown as FamilyMembersService,
      sosGateway as unknown as SosGateway,
      {} as unknown as SubscriptionsService,
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
