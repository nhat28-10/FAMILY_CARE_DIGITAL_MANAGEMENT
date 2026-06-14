import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EssentialType,
  FinanceCategoryStatus,
  FinanceLedgerStatus,
  FinanceModelStatus,
  FinanceModelType,
  FamilyRole,
  LedgerEntryStatus,
  LedgerEntryType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { FINANCE_MODEL_TEMPLATES } from '../constants/finance-model-templates.constant';
import { CreateFinanceCategoryDto } from '../dto/create-finance-category.dto';
import { CreateFinanceJarDto } from '../dto/create-finance-jar.dto';
import { CreateFinanceModelDto } from '../dto/create-finance-model.dto';
import { CreateLedgerEntryDto } from '../dto/create-ledger-entry.dto';
import { CreateMemberMonthlyFinanceDto } from '../dto/create-member-monthly-finance.dto';
import {
  OptionalFinancePeriodDto,
  RequiredFinancePeriodDto,
} from '../dto/finance-period.dto';
import { UpdateMemberMonthlyFinanceDto } from '../dto/update-member-monthly-finance.dto';
import { UpdateFinanceJarDto } from '../dto/update-finance-jar.dto';

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

  listFinanceModelTemplates() {
    return FINANCE_MODEL_TEMPLATES;
  }

  listFinanceModels(familyId: string, familyRole: FamilyRole) {
    return this.prisma.financeModel.findMany({
      where: {
        familyId,
        status: this.isFinanceManager(familyRole)
          ? undefined
          : FinanceModelStatus.ACTIVE,
      },
      include: { _count: { select: { jars: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  createFinanceModel(familyId: string, dto: CreateFinanceModelDto) {
    return this.prisma.$transaction(async (tx) => {
      const model = await tx.financeModel.create({
        data: {
          familyId,
          modelType: dto.modelType,
          name: dto.name.trim(),
        },
      });

      await this.createDefaultJars(tx, model.id, dto.modelType);

      return tx.financeModel.findUniqueOrThrow({
        where: { id: model.id },
        include: { jars: { orderBy: { createdAt: 'asc' } } },
      });
    });
  }

  activateFinanceModel(familyId: string, modelId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const model = await tx.financeModel.findFirst({
          where: { id: modelId, familyId },
          include: { _count: { select: { jars: true } } },
        });
        if (!model) {
          throw new NotFoundException(
            'Không tìm thấy mô hình tài chính trong gia đình này',
          );
        }

        if (model._count.jars === 0) {
          await this.createDefaultJars(tx, model.id, model.modelType);
        }
        await this.assertJarAllocationWithinLimit(tx, model.id);

        await tx.financeModel.updateMany({
          where: {
            familyId,
            status: FinanceModelStatus.ACTIVE,
            id: { not: modelId },
          },
          data: { status: FinanceModelStatus.INACTIVE },
        });

        return tx.financeModel.update({
          where: { id: modelId },
          data: { status: FinanceModelStatus.ACTIVE },
          include: { jars: { orderBy: { createdAt: 'asc' } } },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  listFinanceJars(familyId: string, familyRole: FamilyRole) {
    const manager = this.isFinanceManager(familyRole);
    return this.prisma.financeJar.findMany({
      where: {
        financeModel: {
          familyId,
          status: manager ? undefined : FinanceModelStatus.ACTIVE,
        },
        isActive: manager ? undefined : true,
      },
      include: {
        financeModel: {
          select: { id: true, name: true, modelType: true, status: true },
        },
      },
      orderBy: [{ financeModel: { createdAt: 'desc' } }, { createdAt: 'asc' }],
    });
  }

  createFinanceJar(familyId: string, dto: CreateFinanceJarDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const model = await this.requireFamilyFinanceModel(
          tx,
          familyId,
          dto.financeModelId,
        );
        this.assertDraftFinanceModel(model.status);

        const isActive = dto.isActive ?? true;
        if (isActive) {
          await this.assertJarAllocationWithinLimit(
            tx,
            dto.financeModelId,
            new Prisma.Decimal(dto.allocationPercentage),
          );
        }

        try {
          return await tx.financeJar.create({
            data: {
              financeModelId: dto.financeModelId,
              name: dto.name.trim(),
              jarCode: dto.jarCode.trim().toUpperCase(),
              allocationPercentage: new Prisma.Decimal(
                dto.allocationPercentage,
              ),
              description: dto.description?.trim(),
              isActive,
            },
            include: { financeModel: true },
          });
        } catch (error) {
          if (this.isUniqueConstraintError(error)) {
            throw new ConflictException(
              'Mã hũ tài chính đã tồn tại trong mô hình này',
            );
          }
          throw error;
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  updateFinanceJar(familyId: string, jarId: string, dto: UpdateFinanceJarDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const jar = await tx.financeJar.findFirst({
          where: { id: jarId, financeModel: { familyId } },
          include: { financeModel: { select: { status: true } } },
        });
        if (!jar) {
          throw new NotFoundException(
            'Không tìm thấy hũ tài chính trong gia đình này',
          );
        }
        this.assertDraftFinanceModel(jar.financeModel.status);

        const isActive = dto.isActive ?? jar.isActive;
        const allocationPercentage =
          dto.allocationPercentage === undefined
            ? jar.allocationPercentage
            : new Prisma.Decimal(dto.allocationPercentage);
        if (isActive) {
          await this.assertJarAllocationWithinLimit(
            tx,
            jar.financeModelId,
            allocationPercentage,
            jar.id,
          );
        }

        try {
          return await tx.financeJar.update({
            where: { id: jar.id },
            data: {
              name: dto.name?.trim(),
              jarCode: dto.jarCode?.trim().toUpperCase(),
              allocationPercentage,
              description:
                dto.description === null ? null : dto.description?.trim(),
              isActive: dto.isActive,
            },
            include: { financeModel: true },
          });
        } catch (error) {
          if (this.isUniqueConstraintError(error)) {
            throw new ConflictException(
              'Mã hũ tài chính đã tồn tại trong mô hình này',
            );
          }
          throw error;
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
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

  private isFinanceManager(familyRole: FamilyRole) {
    return (
      familyRole === FamilyRole.FAMILY_MANAGER ||
      familyRole === FamilyRole.DEPUTY_MEMBER
    );
  }

  private async requireFamilyFinanceModel(
    tx: Prisma.TransactionClient,
    familyId: string,
    modelId: string,
  ) {
    const model = await tx.financeModel.findFirst({
      where: { id: modelId, familyId },
    });
    if (!model) {
      throw new NotFoundException(
        'Không tìm thấy mô hình tài chính trong gia đình này',
      );
    }
    return model;
  }

  private async createDefaultJars(
    tx: Prisma.TransactionClient,
    financeModelId: string,
    modelType: FinanceModelType,
  ) {
    const template = FINANCE_MODEL_TEMPLATES.find(
      (item) => item.modelType === modelType,
    );
    if (!template?.jars.length) {
      return;
    }
    await tx.financeJar.createMany({
      data: template.jars.map((jar) => ({ ...jar, financeModelId })),
      skipDuplicates: true,
    });
  }

  private assertDraftFinanceModel(status: FinanceModelStatus) {
    if (status !== FinanceModelStatus.DRAFT) {
      throw new BadRequestException(
        'Chỉ có thể chỉnh sửa hũ tài chính khi mô hình đang ở trạng thái DRAFT',
      );
    }
  }

  private async assertJarAllocationWithinLimit(
    tx: Prisma.TransactionClient,
    financeModelId: string,
    addedAllocation = new Prisma.Decimal(0),
    excludedJarId?: string,
  ) {
    const current = await tx.financeJar.aggregate({
      where: {
        financeModelId,
        isActive: true,
        id: excludedJarId ? { not: excludedJarId } : undefined,
      },
      _sum: { allocationPercentage: true },
    });
    const total = (
      current._sum.allocationPercentage ?? new Prisma.Decimal(0)
    ).plus(addedAllocation);
    if (total.greaterThan(100)) {
      throw new BadRequestException(
        'Tổng tỷ lệ phân bổ của các hũ hoạt động không được vượt quá 100%',
      );
    }
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
