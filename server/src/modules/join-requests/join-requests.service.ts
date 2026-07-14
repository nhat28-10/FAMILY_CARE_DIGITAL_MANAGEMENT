import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FamilyMember,
  FamilyRole,
  JoinRequest,
  JoinRequestStatus,
  MemberStatus,
  Prisma,
  Relationship,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { FamilyMembersService } from '../family-members/family-members.service';

/** Thông tin family công khai cho màn nhập mã. */
const familyPreviewSelect = {
  id: true,
  name: true,
  avatarUrl: true,
} as const;

/** Thông tin user nhúng vào danh sách yêu cầu cho manager. */
const requesterSelect = {
  id: true,
  email: true,
  fullName: true,
  avatarUrl: true,
} as const;

@Injectable()
export class JoinRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly familyMembersService: FamilyMembersService,
  ) {}

  /** Tra family theo mã mời (đã normalize) — màn nhập mã, public. */
  async previewByCode(code: string) {
    const family = await this.findFamilyByCodeOrThrow(code);
    return { family };
  }

  /** User gửi yêu cầu tham gia bằng mã mời (chờ manager duyệt). */
  async create(
    code: string,
    userId: string,
    dto: { message?: string },
  ): Promise<JoinRequest> {
    const family = await this.findFamilyByCodeOrThrow(code);

    const existingMember = await this.familyMembersService.findByFamilyAndUser(
      family.id,
      userId,
    );
    if (existingMember && existingMember.status === MemberStatus.ACTIVE) {
      throw new ConflictException('Bạn đã là thành viên của gia đình này');
    }

    const pending = await this.prisma.joinRequest.findFirst({
      where: { familyId: family.id, userId, status: JoinRequestStatus.PENDING },
    });
    if (pending) {
      throw new ConflictException(
        'Bạn đã gửi yêu cầu tham gia gia đình này rồi',
      );
    }

    return this.prisma.joinRequest.create({
      data: { familyId: family.id, userId, message: dto.message ?? null },
      include: { family: { select: familyPreviewSelect } },
    });
  }

  /** Các yêu cầu của tôi (mọi trạng thái) — màn theo dõi. */
  listMine(userId: string): Promise<JoinRequest[]> {
    return this.prisma.joinRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { family: { select: familyPreviewSelect } },
    });
  }

  /** Chủ yêu cầu hủy khi còn PENDING. */
  async cancel(userId: string, id: string): Promise<JoinRequest> {
    const request = await this.prisma.joinRequest.findFirst({
      where: { id, userId },
    });
    if (!request) {
      throw new NotFoundException('Không tìm thấy yêu cầu tham gia');
    }
    if (request.status !== JoinRequestStatus.PENDING) {
      throw new BadRequestException('Yêu cầu đã được xử lý, không thể hủy');
    }
    try {
      return await this.prisma.joinRequest.update({
        where: { id, status: JoinRequestStatus.PENDING },
        data: { status: JoinRequestStatus.CANCELED },
      });
    } catch (error) {
      if (this.isRecordNotFound(error)) {
        throw new BadRequestException('Yêu cầu đã được xử lý, không thể hủy');
      }
      throw error;
    }
  }

  /** Danh sách yêu cầu của family cho manager (lọc status optional). */
  listByFamily(
    familyId: string,
    status?: JoinRequestStatus,
  ): Promise<JoinRequest[]> {
    return this.prisma.joinRequest.findMany({
      where: { familyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: requesterSelect } },
    });
  }

  /**
   * Manager duyệt yêu cầu → user thành thành viên ACTIVE. Manager chọn vai
   * trò/quan hệ lúc duyệt (default FAMILY_MEMBER/OTHER). Membership cũ đã
   * soft-remove được reactivate tại chỗ (unique familyId+userId).
   */
  async approve(
    familyId: string,
    approverMemberId: string,
    id: string,
    dto?: { familyRole?: FamilyRole; relationship?: Relationship },
  ): Promise<FamilyMember> {
    const request = await this.findPendingInFamilyOrThrow(
      familyId,
      id,
      'Chỉ có thể duyệt yêu cầu đang chờ',
    );
    const familyRole = dto?.familyRole ?? FamilyRole.FAMILY_MEMBER;
    const relationship = dto?.relationship ?? Relationship.OTHER;

    await this.familyMembersService.assertCanAddMember(familyId);

    const existing = await this.familyMembersService.findByFamilyAndUser(
      familyId,
      request.userId,
    );
    const memberWrite = existing
      ? this.prisma.familyMember.update({
          where: { familyId_userId: { familyId, userId: request.userId } },
          data: {
            status: MemberStatus.ACTIVE,
            leftAt: null,
            familyRole,
            relationship,
          },
        })
      : this.prisma.familyMember.create({
          data: { familyId, userId: request.userId, familyRole, relationship },
        });

    try {
      const [member] = await this.prisma.$transaction([
        memberWrite,
        this.prisma.joinRequest.update({
          where: { id: request.id, status: JoinRequestStatus.PENDING },
          data: {
            status: JoinRequestStatus.APPROVED,
            decidedByMemberId: approverMemberId,
            decidedAt: new Date(),
          },
        }),
      ]);
      return member;
    } catch (error) {
      if (this.isRecordNotFound(error)) {
        throw new BadRequestException('Chỉ có thể duyệt yêu cầu đang chờ');
      }
      throw error;
    }
  }

  /** Manager từ chối yêu cầu đang chờ. */
  async reject(
    familyId: string,
    deciderMemberId: string,
    id: string,
  ): Promise<JoinRequest> {
    const request = await this.findPendingInFamilyOrThrow(
      familyId,
      id,
      'Chỉ có thể từ chối yêu cầu đang chờ duyệt',
    );
    try {
      return await this.prisma.joinRequest.update({
        where: { id: request.id, status: JoinRequestStatus.PENDING },
        data: {
          status: JoinRequestStatus.REJECTED,
          decidedByMemberId: deciderMemberId,
          decidedAt: new Date(),
        },
      });
    } catch (error) {
      if (this.isRecordNotFound(error)) {
        throw new BadRequestException(
          'Chỉ có thể từ chối yêu cầu đang chờ duyệt',
        );
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Mã nhập từ client: trim + uppercase (không phân biệt hoa thường). */
  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private async findFamilyByCodeOrThrow(code: string) {
    const family = await this.prisma.family.findUnique({
      where: { inviteCode: this.normalizeCode(code) },
      select: familyPreviewSelect,
    });
    if (!family) {
      throw new NotFoundException('Mã mời không tồn tại');
    }
    return family;
  }

  /** true khi update/transaction thất bại vì record không còn khớp where (đã bị race). */
  private isRecordNotFound(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    );
  }

  private async findPendingInFamilyOrThrow(
    familyId: string,
    id: string,
    notPendingMessage: string,
  ): Promise<JoinRequest> {
    const request = await this.prisma.joinRequest.findFirst({
      where: { id, familyId },
    });
    if (!request) {
      throw new NotFoundException('Không tìm thấy yêu cầu tham gia');
    }
    if (request.status !== JoinRequestStatus.PENDING) {
      throw new BadRequestException(notPendingMessage);
    }
    return request;
  }
}
