import { MemberStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { FamilyMembersService } from './family-members.service';

describe('FamilyMembersService.remove (soft delete)', () => {
  const familyId = 'family-id';
  const userId = 'user-id';
  let prisma: { familyMember: Record<string, jest.Mock> };
  let service: FamilyMembersService;

  beforeEach(() => {
    prisma = {
      familyMember: {
        update: jest.fn().mockResolvedValue({ id: 'member-id' }),
        delete: jest.fn(),
      },
    };
    service = new FamilyMembersService(prisma as unknown as PrismaService);
  });

  it('soft-deletes by setting status=REMOVED + leftAt, never hard-deletes', async () => {
    await service.remove(familyId, userId);

    expect(prisma.familyMember.delete).not.toHaveBeenCalled();
    expect(prisma.familyMember.update).toHaveBeenCalledTimes(1);

    const arg = prisma.familyMember.update.mock.calls[0][0];
    expect(arg.where).toEqual({ familyId_userId: { familyId, userId } });
    expect(arg.data.status).toBe(MemberStatus.REMOVED);
    expect(arg.data.leftAt).toBeInstanceOf(Date);
  });
});
