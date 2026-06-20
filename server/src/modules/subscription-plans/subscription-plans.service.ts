import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  buildPaginated,
  PaginatedResult,
  skipFor,
} from '../../common/types/paginated-result';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { ListSubscriptionPlansQueryDto } from './dto/list-subscription-plans-query.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';

type SubscriptionPlan = Prisma.SubscriptionPlanGetPayload<object>;

/**
 * Data access for subscription plans. Admin (SYSTEM_ADMIN) manages the full
 * lifecycle; family workspaces only read the active plans.
 */
@Injectable()
export class SubscriptionPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSubscriptionPlanDto): Promise<SubscriptionPlan> {
    const existing = await this.prisma.subscriptionPlan.findUnique({
      where: { planCode: dto.planCode },
    });
    if (existing) {
      throw new ConflictException('Mã gói đã tồn tại');
    }

    return this.prisma.subscriptionPlan.create({
      data: {
        planCode: dto.planCode,
        name: dto.name,
        annualPrice: dto.annualPrice,
        maxMembers: dto.maxMembers,
        storageLimit: dto.storageLimit,
        featureAccess:
          (dto.featureAccess as Prisma.InputJsonValue | undefined) ?? undefined,
        stripePriceId: dto.stripePriceId ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async list(
    q: ListSubscriptionPlansQueryDto,
  ): Promise<PaginatedResult<SubscriptionPlan>> {
    const where: Prisma.SubscriptionPlanWhereInput = {};
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' };
    if (q.isActive !== undefined) where.isActive = q.isActive;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.subscriptionPlan.findMany({
        where,
        orderBy: { annualPrice: 'asc' },
        skip: skipFor(q.page, q.limit),
        take: q.limit,
      }),
      this.prisma.subscriptionPlan.count({ where }),
    ]);

    return buildPaginated(items, total, q.page, q.limit);
  }

  /** Active plans only — what a family manager browses before subscribing. */
  listActive(): Promise<SubscriptionPlan[]> {
    return this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { annualPrice: 'asc' },
    });
  }

  async getById(id: string): Promise<SubscriptionPlan> {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });
    if (!plan) throw new NotFoundException('Không tìm thấy gói đăng ký');
    return plan;
  }

  async update(
    id: string,
    dto: UpdateSubscriptionPlanDto,
  ): Promise<SubscriptionPlan> {
    await this.getById(id);

    if (dto.planCode) {
      const clash = await this.prisma.subscriptionPlan.findFirst({
        where: { planCode: dto.planCode, id: { not: id } },
      });
      if (clash) throw new ConflictException('Mã gói đã tồn tại');
    }

    return this.prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...dto,
        featureAccess:
          (dto.featureAccess as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });
  }

  async remove(id: string): Promise<null> {
    await this.getById(id);
    await this.prisma.subscriptionPlan.delete({ where: { id } });
    return null;
  }
}
