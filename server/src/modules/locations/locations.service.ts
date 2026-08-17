import { Injectable } from '@nestjs/common';
import { GpsSourceType, MemberStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import type { UpdateMyLocationDto } from './dto/update-my-location.dto';
import { LocationsGateway } from './locations.gateway';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly locationsGateway: LocationsGateway,
  ) {}

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

    const member = await this.prisma.familyMember.findFirst({
      where: {
        id: memberId,
        familyId: workspaceId,
        status: MemberStatus.ACTIVE,
      },
      select: {
        id: true,
        displayName: true,
        locationSharingEnabled: true,
        user: { select: { id: true, fullName: true, avatarUrl: true } },
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

    if (member?.locationSharingEnabled) {
      this.locationsGateway.emitLocationUpdated(
        workspaceId,
        this.buildLocationPayload(workspaceId, member, point, dto),
      );
    }

    return point;
  }

  /** Opt the calling member in or out of family-map sharing. */
  async setMyLocationSharing(
    workspaceId: string,
    memberId: string,
    isSharing: boolean,
  ) {
    const updated = await this.prisma.familyMember.update({
      where: { id: memberId },
      data: { locationSharingEnabled: isSharing },
      select: { id: true, locationSharingEnabled: true },
    });

    this.locationsGateway.emitSharingChanged(workspaceId, {
      workspaceId,
      memberId: updated.id,
      isSharing: updated.locationSharingEnabled,
    });

    return updated;
  }

  private buildLocationPayload(
    workspaceId: string,
    member: {
      id: string;
      displayName: string | null;
      user: { id: string; fullName: string | null; avatarUrl: string | null };
    },
    point: {
      latitude?: unknown;
      longitude?: unknown;
      accuracy?: unknown;
      recordedAt?: Date;
    },
    fallback: UpdateMyLocationDto,
  ) {
    return {
      workspaceId,
      userId: member.user.id,
      memberId: member.id,
      displayName: member.displayName ?? member.user.fullName,
      avatarUrl: member.user.avatarUrl,
      latitude: this.toNumber(point.latitude ?? fallback.latitude),
      longitude: this.toNumber(point.longitude ?? fallback.longitude),
      accuracy:
        point.accuracy === null
          ? null
          : this.toNullableNumber(point.accuracy ?? fallback.accuracy),
      updatedAt: point.recordedAt ?? new Date(),
      isSharing: true,
    };
  }

  private toNullableNumber(value: unknown): number | null {
    if (value === undefined || value === null) {
      return null;
    }
    return this.toNumber(value);
  }

  private toNumber(value: unknown): number {
    return Number(value);
  }
}
