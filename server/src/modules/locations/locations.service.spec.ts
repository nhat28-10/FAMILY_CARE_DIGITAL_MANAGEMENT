import { GpsSourceType, MemberStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { LocationsService } from './locations.service';

describe('LocationsService', () => {
  const workspaceId = 'family-id';
  const memberId = 'member-1';

  const recordedAt = new Date('2026-07-16T05:12:38.000Z');
  const sharingMember = {
    id: memberId,
    displayName: null,
    locationSharingEnabled: true,
    user: {
      id: 'user-1',
      fullName: 'Nguyễn Văn A',
      avatarUrl: null,
    },
    memberLocationPoints: [
      {
        id: 'p1',
        latitude: new Prisma.Decimal('10.77689'),
        longitude: new Prisma.Decimal('106.70091'),
        accuracy: new Prisma.Decimal('18'),
        recordedAt,
      },
    ],
  };

  let prisma: {
    familyMember: { findMany: jest.Mock; update: jest.Mock };
    memberLocationPoint: { create: jest.Mock; deleteMany: jest.Mock };
  };
  let service: LocationsService;

  beforeEach(() => {
    prisma = {
      familyMember: { findMany: jest.fn(), update: jest.fn() },
      memberLocationPoint: {
        create: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    service = new LocationsService(prisma as unknown as PrismaService);
  });

  describe('listFamilyLocations', () => {
    it('returns the latest point per sharing member in the map shape', async () => {
      prisma.familyMember.findMany.mockResolvedValue([sharingMember]);

      const result = await service.listFamilyLocations(workspaceId);

      expect(result).toEqual([
        {
          userId: 'user-1',
          memberId,
          displayName: 'Nguyễn Văn A',
          avatarUrl: null,
          latitude: 10.77689,
          longitude: 106.70091,
          accuracy: 18,
          updatedAt: recordedAt,
          isSharing: true,
        },
      ]);
    });

    it('only queries ACTIVE members that enabled sharing', async () => {
      prisma.familyMember.findMany.mockResolvedValue([]);

      await service.listFamilyLocations(workspaceId);

      expect(prisma.familyMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            familyId: workspaceId,
            status: MemberStatus.ACTIVE,
            locationSharingEnabled: true,
          },
        }),
      );
    });

    it('skips sharing members that have no location point yet', async () => {
      prisma.familyMember.findMany.mockResolvedValue([
        { ...sharingMember, memberLocationPoints: [] },
      ]);

      await expect(service.listFamilyLocations(workspaceId)).resolves.toEqual(
        [],
      );
    });

    it('prefers the per-family displayName over the account fullName', async () => {
      prisma.familyMember.findMany.mockResolvedValue([
        { ...sharingMember, displayName: 'Bố' },
      ]);

      const [entry] = await service.listFamilyLocations(workspaceId);

      expect(entry.displayName).toBe('Bố');
    });
  });

  describe('pushMyLocation', () => {
    const dto = { latitude: 10.77689, longitude: 106.70091, accuracy: 18 };

    it('inserts a MOBILE_GPS point for the calling member', async () => {
      prisma.memberLocationPoint.create.mockResolvedValue({ id: 'p1' });

      await service.pushMyLocation(workspaceId, memberId, dto);

      const data = prisma.memberLocationPoint.create.mock.calls[0][0]
        .data as Record<string, unknown>;
      expect(data).toEqual(
        expect.objectContaining({
          workspaceId,
          memberId,
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracy: dto.accuracy,
          sourceType: GpsSourceType.MOBILE_GPS,
        }),
      );
      expect((data.recordedAt as Date).getTime()).toBeLessThanOrEqual(
        Date.now(),
      );
    });

    it('prunes stale history of the member after inserting', async () => {
      prisma.memberLocationPoint.create.mockResolvedValue({ id: 'p-new' });

      await service.pushMyLocation(workspaceId, memberId, dto);

      expect(prisma.memberLocationPoint.deleteMany).toHaveBeenCalledWith({
        where: {
          workspaceId,
          memberId,
          id: { not: 'p-new' },
          recordedAt: { lt: expect.any(Date) as Date },
        },
      });
    });
  });

  describe('setMyLocationSharing', () => {
    it('updates the sharing flag of the calling member', async () => {
      prisma.familyMember.update.mockResolvedValue({
        id: memberId,
        locationSharingEnabled: false,
      });

      const result = await service.setMyLocationSharing(memberId, false);

      expect(prisma.familyMember.update).toHaveBeenCalledWith({
        where: { id: memberId },
        data: { locationSharingEnabled: false },
        select: { id: true, locationSharingEnabled: true },
      });
      expect(result).toEqual({ id: memberId, locationSharingEnabled: false });
    });
  });
});
