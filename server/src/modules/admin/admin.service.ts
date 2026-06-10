import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  buildPaginated,
  PaginatedResult,
  skipFor,
} from '../../common/types/paginated-result';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeUser, SafeUser } from '../users/users.types';
import { AdminUpdateFamilyDto } from './dto/update-family.dto';
import { AdminUpdateInvitationDto } from './dto/update-invitation.dto';
import { AdminUpdateMemberDto } from './dto/update-member.dto';
import { AdminUpdateUserDto } from './dto/update-user.dto';
import { ListFamiliesQueryDto } from './dto/list-families-query.dto';
import { ListInvitationsQueryDto } from './dto/list-invitations-query.dto';
import { ListMembersQueryDto } from './dto/list-members-query.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';

/** Non-sensitive user fields to embed in family/member responses. */
const memberUserSelect = {
  id: true,
  email: true,
  fullName: true,
  avatarUrl: true,
  userType: true,
} as const;

const familyMemberInclude = {
  members: {
    include: { user: { select: memberUserSelect } },
    orderBy: { joinedAt: 'asc' as const },
  },
};

/**
 * System-admin data access for the basic entities. All queries go straight to
 * Prisma; user records are sanitized and invitation token hashes are stripped.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // --------------------------------------------------------------------------
  // Users
  // --------------------------------------------------------------------------

  async listUsers(q: ListUsersQueryDto): Promise<PaginatedResult<SafeUser>> {
    const where: Prisma.UserWhereInput = {};
    if (q.search) where.email = { contains: q.search, mode: 'insensitive' };
    if (q.userType) where.userType = q.userType;
    if (q.accountStatus) where.accountStatus = q.accountStatus;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipFor(q.page, q.limit),
        take: q.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return buildPaginated(rows.map(sanitizeUser), total, q.page, q.limit);
  }

  async getUser(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return sanitizeUser(user);
  }

  async updateUser(id: string, dto: AdminUpdateUserDto): Promise<SafeUser> {
    await this.getUser(id);
    const user = await this.prisma.user.update({ where: { id }, data: dto });
    return sanitizeUser(user);
  }

  async deleteUser(id: string): Promise<null> {
    await this.getUser(id);
    await this.prisma.user.delete({ where: { id } });
    return null;
  }

  // --------------------------------------------------------------------------
  // Families
  // --------------------------------------------------------------------------

  async listFamilies(q: ListFamiliesQueryDto) {
    const where: Prisma.FamilyWhereInput = {};
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' };
    if (q.status) where.status = q.status;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.family.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipFor(q.page, q.limit),
        take: q.limit,
        include: { _count: { select: { members: true } } },
      }),
      this.prisma.family.count({ where }),
    ]);

    return buildPaginated(items, total, q.page, q.limit);
  }

  async getFamily(id: string) {
    const family = await this.prisma.family.findUnique({
      where: { id },
      include: familyMemberInclude,
    });
    if (!family) throw new NotFoundException('Family not found');
    return family;
  }

  async updateFamily(id: string, dto: AdminUpdateFamilyDto) {
    await this.getFamily(id);
    return this.prisma.family.update({
      where: { id },
      data: dto,
      include: familyMemberInclude,
    });
  }

  async deleteFamily(id: string): Promise<null> {
    await this.getFamily(id);
    await this.prisma.family.delete({ where: { id } });
    return null;
  }

  // --------------------------------------------------------------------------
  // Invitations (tokenHash never returned)
  // --------------------------------------------------------------------------

  async listInvitations(q: ListInvitationsQueryDto) {
    const where: Prisma.InvitationWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.familyId) where.familyId = q.familyId;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.invitation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipFor(q.page, q.limit),
        take: q.limit,
        omit: { tokenHash: true },
      }),
      this.prisma.invitation.count({ where }),
    ]);

    return buildPaginated(items, total, q.page, q.limit);
  }

  async getInvitation(id: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id },
      omit: { tokenHash: true },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    return invitation;
  }

  async updateInvitation(id: string, dto: AdminUpdateInvitationDto) {
    await this.getInvitation(id);
    return this.prisma.invitation.update({
      where: { id },
      data: { status: dto.status },
      omit: { tokenHash: true },
    });
  }

  async deleteInvitation(id: string): Promise<null> {
    await this.getInvitation(id);
    await this.prisma.invitation.delete({ where: { id } });
    return null;
  }

  // --------------------------------------------------------------------------
  // Family members
  // --------------------------------------------------------------------------

  async listMembers(q: ListMembersQueryDto) {
    const where: Prisma.FamilyMemberWhereInput = {};
    if (q.familyId) where.familyId = q.familyId;
    if (q.userId) where.userId = q.userId;
    if (q.familyRole) where.familyRole = q.familyRole;
    if (q.status) where.status = q.status;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.familyMember.findMany({
        where,
        orderBy: { joinedAt: 'desc' },
        skip: skipFor(q.page, q.limit),
        take: q.limit,
        include: {
          user: { select: memberUserSelect },
          family: { select: { id: true, name: true } },
        },
      }),
      this.prisma.familyMember.count({ where }),
    ]);

    return buildPaginated(items, total, q.page, q.limit);
  }

  async getMember(id: string) {
    const member = await this.prisma.familyMember.findUnique({
      where: { id },
      include: {
        user: { select: memberUserSelect },
        family: { select: { id: true, name: true } },
      },
    });
    if (!member) throw new NotFoundException('Family member not found');
    return member;
  }

  async updateMember(id: string, dto: AdminUpdateMemberDto) {
    await this.getMember(id);
    return this.prisma.familyMember.update({
      where: { id },
      data: dto,
      include: { user: { select: memberUserSelect } },
    });
  }

  async deleteMember(id: string): Promise<null> {
    await this.getMember(id);
    await this.prisma.familyMember.delete({ where: { id } });
    return null;
  }
}
