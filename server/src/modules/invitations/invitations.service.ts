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
  Relationship,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { FamilyMembersService } from '../family-members/family-members.service';
import { SafeUser } from '../users/users.types';
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
    invitedById: string,
    dto: CreateInvitationDto,
  ): Promise<{ invitation: SafeInvitation; token: string }> {
    const token = randomBytes(32).toString('hex');
    const days = this.config.get<number>('invitation.expiresInDays', 7);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const invitation = await this.prisma.invitation.create({
      data: {
        familyId,
        email: dto.email.toLowerCase(),
        tokenHash: this.hashToken(token),
        familyRole: dto.familyRole ?? FamilyRole.MEMBER,
        relationship: dto.relationship ?? Relationship.OTHER,
        invitedById,
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
   * Current user accepts an invitation → becomes a family member with the
   * invited role/relationship; invitation marked ACCEPTED.
   */
  async accept(token: string, user: SafeUser): Promise<FamilyMember> {
    const invitation = await this.findByTokenOrThrow(token);
    this.assertPendingAndFresh(invitation);
    this.assertEmailMatches(invitation, user);

    const existing = await this.familyMembersService.findByFamilyAndUser(
      invitation.familyId,
      user.id,
    );
    if (existing) {
      throw new ConflictException('You are already a member of this family');
    }

    const [member] = await this.prisma.$transaction([
      this.prisma.familyMember.create({
        data: {
          familyId: invitation.familyId,
          userId: user.id,
          familyRole: invitation.familyRole,
          relationship: invitation.relationship,
        },
      }),
      this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED },
      }),
    ]);

    return member;
  }

  /** Current user rejects an invitation → marked REJECTED. */
  async reject(token: string, user: SafeUser): Promise<SafeInvitation> {
    const invitation = await this.findByTokenOrThrow(token);
    this.assertPendingAndFresh(invitation);
    this.assertEmailMatches(invitation, user);

    const updated = await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.REJECTED },
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
      throw new NotFoundException('Invitation not found');
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
      throw new BadRequestException('Invitation has expired');
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(
        `Invitation is no longer pending (status: ${invitation.status})`,
      );
    }
  }

  private assertEmailMatches(invitation: Invitation, user: SafeUser): void {
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException(
        'This invitation was sent to a different email address',
      );
    }
  }

  private sanitize<T extends Invitation>(invitation: T): Omit<T, 'tokenHash'> {
    const { tokenHash: _tokenHash, ...safe } = invitation;
    return safe;
  }
}
