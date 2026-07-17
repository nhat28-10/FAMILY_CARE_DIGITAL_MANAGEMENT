import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FamilyRole,
  FinanceCategoryStatus,
  FinanceLedgerStatus,
  LedgerEntryStatus,
  LedgerEntryType,
  MemberStatus,
  Prisma,
  SpendingSupportRequestStatus,
} from '@prisma/client';

import {
  buildPaginated,
  skipFor,
} from '../../../common/types/paginated-result';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSpendingSupportRequestDto } from '../dto/create-spending-support-request.dto';
import {
  ReviewSpendingSupportRequestDto,
  SpendingSupportDecision,
} from '../dto/review-spending-support-request.dto';
import { SpendingSupportRequestQueryDto } from '../dto/spending-support-request-query.dto';

@Injectable()
export class SpendingSupportRequestService {
  constructor(private readonly prisma: PrismaService) {}

  async listSpendingSupportRequests(
    familyId: string,
    memberId: string,
    query: SpendingSupportRequestQueryDto,
  ) {
    const member = await this.getMemberInFamilyOrThrow(familyId, memberId);
    this.assertQueryPeriod(query.fromDate, query.toDate);
    const requesterMemberId = this.isFinanceManager(member.familyRole)
      ? query.mine
        ? memberId
        : query.requesterMemberId
      : memberId;
    const where: Prisma.SpendingSupportRequestWhereInput = {
      familyId,
      status: query.status,
      requesterMemberId,
      categoryId: query.categoryId,
      createdAt:
        query.fromDate || query.toDate
          ? {
              gte: query.fromDate ? this.toDateOnly(query.fromDate) : undefined,
              lt: query.toDate
                ? this.nextUtcDay(this.toDateOnly(query.toDate))
                : undefined,
            }
          : undefined,
    };
    const [requests, total] = await this.prisma.$transaction([
      this.prisma.spendingSupportRequest.findMany({
        where,
        include: this.spendingSupportRequestInclude(),
        orderBy: { createdAt: 'desc' },
        skip: skipFor(query.page, query.limit),
        take: query.limit,
      }),
      this.prisma.spendingSupportRequest.count({ where }),
    ]);
    return buildPaginated(requests, total, query.page, query.limit);
  }

  async getSpendingSupportRequest(
    familyId: string,
    memberId: string,
    requestId: string,
  ) {
    const member = await this.getMemberInFamilyOrThrow(familyId, memberId);
    const request = await this.requireSpendingSupportRequest(
      this.prisma,
      familyId,
      requestId,
    );
    this.assertCanViewSupportRequest(member, request);
    const ledgerEntry = await this.prisma.ledgerEntry.findFirst({
      where: {
        ledger: { familyId },
        sourceType: 'SUPPORT_REQUEST',
        sourceId: request.id,
      },
      include: { category: true },
    });
    return { ...request, ledgerEntry };
  }

  createSpendingSupportRequest(
    familyId: string,
    memberId: string,
    dto: CreateSpendingSupportRequestDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.getMemberInFamilyOrThrow(familyId, memberId, tx);
      const purpose = dto.purpose.trim();
      if (!purpose) {
        throw new BadRequestException(
          'Muc dich yeu cau ho tro chi tieu la bat buoc',
        );
      }
      if (dto.categoryId) {
        await this.assertSupportCategoryBelongsToFamily(
          tx,
          familyId,
          dto.categoryId,
        );
      }
      return tx.spendingSupportRequest.create({
        data: {
          familyId,
          requesterMemberId: memberId,
          amount: new Prisma.Decimal(dto.amount),
          categoryId: dto.categoryId,
          purpose,
        },
        include: this.spendingSupportRequestInclude(),
      });
    });
  }

  reviewSpendingSupportRequest(
    familyId: string,
    memberId: string,
    requestId: string,
    dto: ReviewSpendingSupportRequestDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const reviewer = await this.getMemberInFamilyOrThrow(
        familyId,
        memberId,
        tx,
      );
      const request = await this.requireSpendingSupportRequest(
        tx,
        familyId,
        requestId,
      );
      this.assertCanReviewSupportRequest(reviewer, request);
      if (request.status !== SpendingSupportRequestStatus.PENDING) {
        throw new ConflictException('Yeu cau ho tro chi tieu da duoc xu ly');
      }

      const reviewedAt = new Date();
      const status =
        dto.decision === SpendingSupportDecision.APPROVE
          ? SpendingSupportRequestStatus.APPROVED
          : SpendingSupportRequestStatus.REJECTED;
      const updated = await tx.spendingSupportRequest.updateMany({
        where: {
          id: request.id,
          familyId,
          status: SpendingSupportRequestStatus.PENDING,
        },
        data: {
          status,
          reviewedByMemberId: reviewer.id,
          reviewedAt,
          decisionNote: dto.decisionNote?.trim(),
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Yeu cau ho tro chi tieu da duoc xu ly');
      }

      let ledgerEntry: Prisma.LedgerEntryGetPayload<{
        include: { category: true };
      }> | null = null;
      if (dto.decision === SpendingSupportDecision.APPROVE) {
        const ledger = await tx.financeLedger.upsert({
          where: { familyId },
          create: {
            familyId,
            ledgerName: 'Shared Family Ledger',
            status: FinanceLedgerStatus.ACTIVE,
          },
          update: { status: FinanceLedgerStatus.ACTIVE },
        });
        ledgerEntry = await tx.ledgerEntry.create({
          data: {
            ledgerId: ledger.id,
            categoryId: request.categoryId,
            createdByMemberId: reviewer.id,
            entryType: LedgerEntryType.SUPPORT,
            amount: request.amount,
            description: `Ho tro chi tieu: ${request.purpose}`,
            note: dto.decisionNote?.trim(),
            entryDate: dto.occurredAt ? new Date(dto.occurredAt) : reviewedAt,
            status: LedgerEntryStatus.ACTIVE,
            sourceType: 'SUPPORT_REQUEST',
            sourceId: request.id,
          },
          include: { category: true },
        });
      }
      const reviewedRequest = await this.requireSpendingSupportRequest(
        tx,
        familyId,
        request.id,
      );
      return { ...reviewedRequest, ledgerEntry };
    });
  }

  cancelSpendingSupportRequest(
    familyId: string,
    memberId: string,
    requestId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const member = await this.getMemberInFamilyOrThrow(
        familyId,
        memberId,
        tx,
      );
      const request = await this.requireSpendingSupportRequest(
        tx,
        familyId,
        requestId,
      );
      if (request.requesterMemberId !== member.id) {
        throw new ForbiddenException(
          'Khong co quyen huy yeu cau ho tro chi tieu nay',
        );
      }
      if (request.status !== SpendingSupportRequestStatus.PENDING) {
        throw new ConflictException('Yeu cau ho tro chi tieu da duoc xu ly');
      }
      const updated = await tx.spendingSupportRequest.updateMany({
        where: {
          id: request.id,
          familyId,
          requesterMemberId: member.id,
          status: SpendingSupportRequestStatus.PENDING,
        },
        data: { status: SpendingSupportRequestStatus.CANCELED },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Yeu cau ho tro chi tieu da duoc xu ly');
      }
      return this.requireSpendingSupportRequest(tx, familyId, request.id);
    });
  }

  private async getMemberInFamilyOrThrow(
    familyId: string,
    memberId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const member = await client.familyMember.findFirst({
      where: { id: memberId, familyId, status: MemberStatus.ACTIVE },
    });
    if (!member) {
      throw new NotFoundException(
        'Khong tim thay thanh vien dang hoat dong trong gia dinh nay',
      );
    }
    return member;
  }

  private isFinanceManager(familyRole: FamilyRole) {
    return (
      familyRole === FamilyRole.FAMILY_MANAGER ||
      familyRole === FamilyRole.DEPUTY_MEMBER
    );
  }

  private spendingSupportRequestInclude() {
    return {
      requesterMember: {
        select: {
          id: true,
          displayName: true,
          user: { select: { id: true, fullName: true, avatarUrl: true } },
        },
      },
      reviewedByMember: {
        select: {
          id: true,
          displayName: true,
          user: { select: { id: true, fullName: true, avatarUrl: true } },
        },
      },
      category: true,
    } satisfies Prisma.SpendingSupportRequestInclude;
  }

  private async requireSpendingSupportRequest(
    client: Prisma.TransactionClient | PrismaService,
    familyId: string,
    requestId: string,
  ) {
    const request = await client.spendingSupportRequest.findFirst({
      where: { id: requestId, familyId },
      include: this.spendingSupportRequestInclude(),
    });
    if (!request) {
      throw new NotFoundException(
        'Khong tim thay yeu cau ho tro chi tieu trong gia dinh nay',
      );
    }
    return request;
  }

  private assertCanViewSupportRequest(
    member: { id: string; familyRole: FamilyRole },
    request: { requesterMemberId: string },
  ) {
    if (
      !this.isFinanceManager(member.familyRole) &&
      request.requesterMemberId !== member.id
    ) {
      throw new ForbiddenException(
        'Khong co quyen xem yeu cau ho tro chi tieu nay',
      );
    }
  }

  private assertCanReviewSupportRequest(
    member: { id: string; familyRole: FamilyRole },
    request: { requesterMemberId: string },
  ) {
    if (!this.isFinanceManager(member.familyRole)) {
      throw new ForbiddenException(
        'Khong co quyen duyet yeu cau ho tro chi tieu',
      );
    }
    if (request.requesterMemberId === member.id) {
      throw new BadRequestException(
        'Khong the tu duyet yeu cau ho tro chi tieu cua chinh minh',
      );
    }
  }

  private async assertSupportCategoryBelongsToFamily(
    client: Prisma.TransactionClient | PrismaService,
    familyId: string,
    categoryId: string,
  ) {
    const category = await client.financeCategory.findFirst({
      where: { id: categoryId, familyId, status: FinanceCategoryStatus.ACTIVE },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException(
        'Khong tim thay danh muc tai chinh dang hoat dong trong gia dinh nay',
      );
    }
  }

  private assertQueryPeriod(start?: string, end?: string) {
    if (start && end) {
      this.assertValidPeriod(this.toDateOnly(start), this.toDateOnly(end));
    }
  }

  private assertValidPeriod(periodStart: Date, periodEnd: Date) {
    if (periodEnd.getTime() < periodStart.getTime()) {
      throw new BadRequestException(
        'Ngay ket thuc ky phai lon hon hoac bang ngay bat dau',
      );
    }
  }

  private toDateOnly(value: string) {
    const date = new Date(value);
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private nextUtcDay(date: Date) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + 1,
      ),
    );
  }
}
