import { Injectable } from '@nestjs/common';
import { GpsSourceType, MemberStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import type { UpdateMyLocationDto } from './dto/update-my-location.dto';

/**
 * Daily location points are history rows (see `MemberLocationPoint`); to keep
 * the table from growing unbounded under periodic pushes, each new push prunes
 * the member's points older than this window.
 */
const LOCATION_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Everyday family-map location sharing — separate from SOS location streaming
 * (`SosLocationPoint`), which only exists inside an active alert.
 */
@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Latest known point of every ACTIVE member who opted in to sharing.
   * One entry per member; members without any point yet are omitted.
   */
  async listFamilyLocations(workspaceId: string) {
    const members = await this.prisma.familyMember.findMany({
      where: {
        familyId: workspaceId,
        status: MemberStatus.ACTIVE,
        locationSharingEnabled: true,
      },
      select: {
        id: true,
        displayName: true,
        user: { select: { id: true, fullName: true, avatarUrl: true } },
        memberLocationPoints: {
          orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
      },
    });

    return members.flatMap((member) => {
      const point = member.memberLocationPoints[0];
      if (!point) {
        return [];
      }
      return [
        {
          userId: member.user.id,
          memberId: member.id,
          displayName: member.displayName ?? member.user.fullName,
          avatarUrl: member.user.avatarUrl,
          latitude: Number(point.latitude),
          longitude: Number(point.longitude),
          accuracy: point.accuracy === null ? null : Number(point.accuracy),
          updatedAt: point.recordedAt,
          isSharing: true,
        },
      ];
    });
  }

  /** Record the calling member's current position and prune their stale history. */
  async pushMyLocation(
    workspaceId: string,
    memberId: string,
    dto: UpdateMyLocationDto,
  ) {
    const point = await this.prisma.memberLocationPoint.create({
      data: {
        workspaceId,
        memberId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy ?? null,
        sourceType: GpsSourceType.MOBILE_GPS,
        recordedAt: new Date(),
      },
    });

    await this.prisma.memberLocationPoint.deleteMany({
      where: {
        workspaceId,
        memberId,
        id: { not: point.id },
        recordedAt: { lt: new Date(Date.now() - LOCATION_RETENTION_MS) },
      },
    });

    return point;
  }

  /** Opt the calling member in or out of family-map sharing. */
  async setMyLocationSharing(memberId: string, isSharing: boolean) {
    return this.prisma.familyMember.update({
      where: { id: memberId },
      data: { locationSharingEnabled: isSharing },
      select: { id: true, locationSharingEnabled: true },
    });
  }
}
