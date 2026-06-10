import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EssentialType,
  FinanceCategoryStatus,
  FinanceLedgerStatus,
  LedgerEntryStatus,
  LedgerEntryType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { CreateFinanceCategoryDto } from '../dto/create-finance-category.dto';
import { CreateLedgerEntryDto } from '../dto/create-ledger-entry.dto';
import { CreateMemberMonthlyFinanceDto } from '../dto/create-member-monthly-finance.dto';
import {
  OptionalFinancePeriodDto,
  RequiredFinancePeriodDto,
} from '../dto/finance-period.dto';
import { UpdateMemberMonthlyFinanceDto } from '../dto/update-member-monthly-finance.dto';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  getMyMonthlyFinance(memberId: string, period: RequiredFinancePeriodDto) {
    return this.prisma.memberMonthlyFinance.findUnique({
      where: {
        memberId_periodMonth_periodYear: {
          memberId,
          periodMonth: period.month,
          periodYear: period.year,
        },
      },
    });
  }

  async createMyMonthlyFinance(
    memberId: string,
    dto: CreateMemberMonthlyFinanceDto,
  ) {
    try {
      return await this.prisma.memberMonthlyFinance.create({
        data: {
          memberId,
          ...dto,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Thông tin tài chính của tháng này đã tồn tại',
        );
      }
      throw error;
    }
  }

  async updateMyMonthlyFinance(
    memberId: string,
    dto: UpdateMemberMonthlyFinanceDto,
  ) {
    const { periodMonth, periodYear, ...values } = dto;

    try {
      return await this.prisma.memberMonthlyFinance.update({
        where: {
          memberId_periodMonth_periodYear: {
            memberId,
            periodMonth,
            periodYear,
          },
        },
        data: values,
      });
    } catch (error) {
      if (this.isRecordNotFoundError(error)) {
        throw new NotFoundException(
          'Không tìm thấy thông tin tài chính của tháng này',
        );
      }
      throw error;
    }
  }

  listCategories(familyId: string) {
    return this.prisma.financeCategory.findMany({
      where: { familyId },
      orderBy: [{ status: 'asc' }, { categoryType: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(familyId: string, dto: CreateFinanceCategoryDto) {
    const name = dto.name.trim();
    const duplicate = await this.prisma.financeCategory.findFirst({
      where: {
        familyId,
        name: { equals: name, mode: 'insensitive' },
        status: FinanceCategoryStatus.ACTIVE,
      },
    });
    if (duplicate) {
      throw new ConflictException(
        'Danh mục tài chính đang hoạt động với tên này đã tồn tại',
      );
    }

    try {
      return await this.prisma.financeCategory.create({
        data: {
          familyId,
          name,
          categoryType: dto.categoryType,
          essentialType: dto.essentialType ?? EssentialType.NEUTRAL,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Danh mục tài chính với tên và loại này đã tồn tại',
        );
      }
      throw error;
    }
  }

  async listLedgerEntries(
    familyId: string,
    requestedPeriod: OptionalFinancePeriodDto,
  ) {
    const ledger = await this.prisma.financeLedger.findUnique({
      where: { familyId },
      select: { id: true },
    });
    if (!ledger) {
      return [];
    }

    const entryDate =
      requestedPeriod.month !== undefined || requestedPeriod.year !== undefined
        ? this.periodRange(
            requestedPeriod.month ?? new Date().getUTCMonth() + 1,
            requestedPeriod.year ?? new Date().getUTCFullYear(),
          )
        : undefined;

    return this.prisma.ledgerEntry.findMany({
      where: {
        ledgerId: ledger.id,
        entryDate: entryDate
          ? { gte: entryDate.start, lt: entryDate.end }
          : undefined,
      },
      include: {
        category: true,
        createdByMember: {
          select: {
            id: true,
            displayName: true,
            user: { select: { id: true, fullName: true, avatarUrl: true } },
          },
        },
      },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createLedgerEntry(
    familyId: string,
    memberId: string,
    dto: CreateLedgerEntryDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const ledger = await tx.financeLedger.upsert({
        where: { familyId },
        create: {
          familyId,
          ledgerName: 'Shared Family Ledger',
          status: FinanceLedgerStatus.ACTIVE,
        },
        update: {},
      });

      if (dto.categoryId) {
        const category = await tx.financeCategory.findFirst({
          where: {
            id: dto.categoryId,
            familyId,
            status: FinanceCategoryStatus.ACTIVE,
          },
        });
        if (!category) {
          throw new NotFoundException(
            'Không tìm thấy danh mục tài chính đang hoạt động trong gia đình này',
          );
        }
      }

      return tx.ledgerEntry.create({
        data: {
          ledgerId: ledger.id,
          categoryId: dto.categoryId,
          createdByMemberId: memberId,
          entryType: dto.entryType,
          amount: new Prisma.Decimal(dto.amount),
          description: dto.description.trim(),
          note: dto.note?.trim(),
          entryDate: new Date(dto.entryDate),
          sourceType: dto.sourceType?.trim(),
          sourceId: dto.sourceId?.trim(),
        },
        include: { category: true },
      });
    });
  }

  async getOverview(
    familyId: string,
    memberId: string,
    requestedPeriod: OptionalFinancePeriodDto,
  ) {
    const period = this.resolveOptionalPeriod(requestedPeriod);
    const { start, end } = this.periodRange(period.month, period.year);
    const ledger = await this.prisma.financeLedger.findUnique({
      where: { familyId },
      select: { id: true, ledgerName: true, status: true },
    });

    const monthlyFinancePromise = this.getMyMonthlyFinance(memberId, period);
    if (!ledger) {
      return {
        period,
        ledger: null,
        totalIncome: new Prisma.Decimal(0),
        totalExpense: new Prisma.Decimal(0),
        balance: new Prisma.Decimal(0),
        entryCount: 0,
        monthlyFinance: await monthlyFinancePromise,
      };
    }

    const baseWhere: Prisma.LedgerEntryWhereInput = {
      ledgerId: ledger.id,
      status: LedgerEntryStatus.ACTIVE,
      entryDate: { gte: start, lt: end },
    };

    const [income, expense, entryCount, monthlyFinance] = await Promise.all([
      this.prisma.ledgerEntry.aggregate({
        where: { ...baseWhere, entryType: LedgerEntryType.INCOME },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: { ...baseWhere, entryType: LedgerEntryType.EXPENSE },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.count({ where: baseWhere }),
      monthlyFinancePromise,
    ]);

    const totalIncome = income._sum.amount ?? new Prisma.Decimal(0);
    const totalExpense = expense._sum.amount ?? new Prisma.Decimal(0);

    return {
      period,
      ledger,
      totalIncome,
      totalExpense,
      balance: totalIncome.minus(totalExpense),
      entryCount,
      monthlyFinance,
    };
  }

  private resolveOptionalPeriod(period: OptionalFinancePeriodDto) {
    const now = new Date();
    return {
      month: period.month ?? now.getUTCMonth() + 1,
      year: period.year ?? now.getUTCFullYear(),
    };
  }

  private periodRange(month: number, year: number) {
    return {
      start: new Date(Date.UTC(year, month - 1, 1)),
      end: new Date(Date.UTC(year, month, 1)),
    };
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private isRecordNotFoundError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    );
  }
}
