import { createHash, randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FamilyMember,
  FamilyRole,
  Invitation,
  InvitationStatus,
  MemberStatus,
  Relationship,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { FamilyMembersService } from '../family-members/family-members.service';
import { SafeUser } from '../users/users.types';
import { ApproveInvitationDto } from './dto/approve-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';

/** Invitation without the secret token hash — safe to return to clients. */
type SafeInvitation = Omit<Invitation, 'tokenHash'>;

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly familyMembersService: FamilyMembersService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Creates a PENDING invitation and returns it together with the raw opaque
   * token (shown only once — only its sha256 hash is stored).
   */
  async create(
    familyId: string,
    createdByMemberId: string,
    dto: CreateInvitationDto,
  ): Promise<{ invitation: SafeInvitation; token: string }> {
    const token = randomBytes(32).toString('hex');
    const days = this.config.get<number>('invitation.expiresInDays', 7);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const invitation = await this.prisma.invitation.create({
      data: {
        familyId,
        email: dto.email.toLowerCase(),
        invitedPhone: dto.invitedPhone ?? null,
        tokenHash: this.hashToken(token),
        familyRole: dto.familyRole ?? FamilyRole.FAMILY_MEMBER,
        relationship: dto.relationship ?? Relationship.OTHER,
        createdByMemberId,
        expiresAt,
      },
    });

    return { invitation: this.sanitize(invitation), token };
  }

  /** Public lookup of an invitation by its raw token. */
  async getByToken(token: string) {
    const invitation = await this.findByTokenOrThrow(token, {
      family: { select: { id: true, name: true } },
    });
    return this.sanitize(invitation);
  }

  /**
   * Step 2 of the join flow: the current user sends a join request for a
   * PENDING invitation. This does NOT create a family member yet — it only
   * marks the invitation CLAIMED and records the claimer. A Family Manager
   * must then approve it (see {@link approve}).
   */
  async claim(token: string, user: SafeUser): Promise<SafeInvitation> {
    const invitation = await this.findByTokenOrThrow(token);
    this.assertPendingAndFresh(invitation);
    this.assertEmailMatches(invitation, user);

    const existing = await this.familyMembersService.findByFamilyAndUser(
      invitation.familyId,
      user.id,
    );
    if (existing && existing.status === MemberStatus.ACTIVE) {
      throw new ConflictException('Bạn đã là thành viên của gia đình này');
    }

    const updated = await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        status: InvitationStatus.CLAIMED,
        claimedById: user.id,
        claimedAt: new Date(),
      },
    });
    return this.sanitize(updated);
  }

  /**
   * Step 3: a Family Manager approves a CLAIMED invitation → the claimer
   * becomes an ACTIVE family member and the invitation is marked APPROVED.
   * The manager may override the role/relationship; otherwise the invitation's
   * values are used.
   */
  async approve(
    familyId: string,
    approverMemberId: string,
    invitationId: string,
    dto?: ApproveInvitationDto,
  ): Promise<FamilyMember> {
    const invitation = await this.findByIdInFamilyOrThrow(
      familyId,
      invitationId,
    );
    if (invitation.status !== InvitationStatus.CLAIMED) {
      throw new BadRequestException(
        'Lời mời chưa được gửi yêu cầu tham gia hoặc đã được xử lý',
      );
    }
    if (!invitation.claimedById) {
      throw new BadRequestException('Lời mời thiếu thông tin người yêu cầu');
    }
    const claimerId = invitation.claimedById;
    const familyRole = dto?.familyRole ?? invitation.familyRole;
    const relationship = dto?.relationship ?? invitation.relationship;

    // Enforce the family's plan member cap before adding/reactivating a member
    // (a soft-removed member doesn't count toward the ACTIVE cap).
    await this.familyMembersService.assertCanAddMember(familyId);

    const existing = await this.familyMembersService.findByFamilyAndUser(
      familyId,
      claimerId,
    );

    // A previously removed/inactive membership is reactivated in place — the
    // row still exists (unique on familyId+userId), so we update it rather
    // than create a duplicate.
    const memberWrite = existing
      ? this.prisma.familyMember.update({
          where: { familyId_userId: { familyId, userId: claimerId } },
          data: {
            status: MemberStatus.ACTIVE,
            leftAt: null,
            familyRole,
            relationship,
          },
        })
      : this.prisma.familyMember.create({
          data: { familyId, userId: claimerId, familyRole, relationship },
        });

    const [member] = await this.prisma.$transaction([
      memberWrite,
      this.prisma.invitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.APPROVED,
          approvedByMemberId: approverMemberId,
          approvedAt: new Date(),
        },
      }),
    ]);

    return member;
  }

  /** A Family Manager rejects a CLAIMED join request → marked REJECTED. */
  async rejectClaim(
    familyId: string,
    invitationId: string,
  ): Promise<SafeInvitation> {
    const invitation = await this.findByIdInFamilyOrThrow(
      familyId,
      invitationId,
    );
    if (invitation.status !== InvitationStatus.CLAIMED) {
      throw new BadRequestException(
        'Chỉ có thể từ chối yêu cầu đang chờ duyệt',
      );
    }

    const updated = await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.REJECTED },
    });
    return this.sanitize(updated);
  }

  /** Invitations of a family (optionally filtered by status) for a manager. */
  listByFamily(
    familyId: string,
    status?: InvitationStatus,
  ): Promise<SafeInvitation[]> {
    return this.prisma.invitation.findMany({
      where: { familyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      omit: { tokenHash: true },
    });
  }

  /** Current user declines an invitation sent to them → marked CANCELED. */
  async reject(token: string, user: SafeUser): Promise<SafeInvitation> {
    const invitation = await this.findByTokenOrThrow(token);
    this.assertPendingAndFresh(invitation);
    this.assertEmailMatches(invitation, user);

    const updated = await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.CANCELED },
    });
    return this.sanitize(updated);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async findByTokenOrThrow<T extends Record<string, unknown>>(
    token: string,
    include?: T,
  ) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: this.hashToken(token) },
      ...(include ? { include } : {}),
    });
    if (!invitation) {
      throw new NotFoundException('Không tìm thấy lời mời');
    }
    return invitation;
  }

  private async findByIdInFamilyOrThrow(
    familyId: string,
    invitationId: string,
  ): Promise<Invitation> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, familyId },
    });
    if (!invitation) {
      throw new NotFoundException('Không tìm thấy lời mời');
    }
    return invitation;
  }

  private assertPendingAndFresh(invitation: Invitation): void {
    if (invitation.expiresAt.getTime() <= Date.now()) {
      // Best-effort mark as expired; don't fail the request if this update races.
      void this.prisma.invitation
        .updateMany({
          where: { id: invitation.id, status: InvitationStatus.PENDING },
          data: { status: InvitationStatus.EXPIRED },
        })
        .catch(() => undefined);
      throw new BadRequestException('Lời mời đã hết hạn');
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(
        `Lời mời không còn hiệu lực (trạng thái: ${invitation.status})`,
      );
    }
  }

  private assertEmailMatches(invitation: Invitation, user: SafeUser): void {
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException('Lời mời được gửi tới một email khác');
    }
  }

  private sanitize<T extends Invitation>(invitation: T): Omit<T, 'tokenHash'> {
    const { tokenHash: _tokenHash, ...safe } = invitation;
    return safe;
  }
}
