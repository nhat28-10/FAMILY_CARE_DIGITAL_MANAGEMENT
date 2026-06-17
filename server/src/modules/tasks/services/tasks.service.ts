import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TaskCategoryStatus,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTaskCategoryDto } from '../dto/create-task-category.dto';
import { CreateTaskDto } from '../dto/create-task.dto';
import { TaskCategoryQueryDto } from '../dto/task-category-query.dto';
import { TaskQueryDto } from '../dto/task-query.dto';
import { UpdateTaskCategoryDto } from '../dto/update-task-category.dto';
import { UpdateTaskDto } from '../dto/update-task.dto';

const RECURRING_PHASE_MESSAGE =
  'Công việc lặp lại sẽ được triển khai ở Phase 4';

const taskInclude = {
  category: true,
  createdByMember: {
    select: {
      id: true,
      familyId: true,
      displayName: true,
      familyRole: true,
      relationship: true,
      status: true,
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          avatarUrl: true,
        },
      },
    },
  },
} satisfies Prisma.TaskInclude;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  listTaskCategories(familyId: string, query: TaskCategoryQueryDto) {
    return this.prisma.taskCategory.findMany({
      where: {
        familyId,
        status: query.status,
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  async createTaskCategory(familyId: string, dto: CreateTaskCategoryDto) {
    await this.assertTaskCategoryNameAvailable(familyId, dto.name);

    try {
      return await this.prisma.taskCategory.create({
        data: {
          familyId,
          name: dto.name,
          description: dto.description,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Danh mục công việc đã tồn tại trong gia đình này',
        );
      }
      throw error;
    }
  }

  async updateTaskCategory(
    familyId: string,
    categoryId: string,
    dto: UpdateTaskCategoryDto,
  ) {
    const category = await this.prisma.taskCategory.findFirst({
      where: { id: categoryId, familyId },
    });
    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục công việc');
    }

    if (dto.name && dto.name !== category.name) {
      await this.assertTaskCategoryNameAvailable(
        familyId,
        dto.name,
        categoryId,
      );
    }

    return this.prisma.taskCategory.update({
      where: { id: categoryId },
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status,
      },
    });
  }

  listTasks(familyId: string, query: TaskQueryDto) {
    return this.prisma.task.findMany({
      where: {
        familyId,
        status: query.status,
        taskCategoryId: query.taskCategoryId,
        priority: query.priority,
        taskType: query.taskType,
      },
      include: taskInclude,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getTask(familyId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, familyId },
      include: taskInclude,
    });
    if (!task) {
      throw new NotFoundException('Không tìm thấy công việc');
    }
    return task;
  }

  async createTask(
    familyId: string,
    createdByMemberId: string,
    dto: CreateTaskDto,
  ) {
    this.assertAdHocOnly(dto.taskType);

    if (dto.taskCategoryId) {
      await this.assertActiveCategoryInFamily(familyId, dto.taskCategoryId);
    }

    const task = await this.prisma.task.create({
      data: {
        familyId,
        createdByMemberId,
        taskCategoryId: dto.taskCategoryId,
        title: dto.title,
        description: dto.description,
        taskType: dto.taskType ?? TaskType.AD_HOC,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        status: dto.status ?? TaskStatus.ACTIVE,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
    });

    return this.prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      include: taskInclude,
    });
  }

  async updateTask(familyId: string, taskId: string, dto: UpdateTaskDto) {
    this.assertAdHocOnly(dto.taskType);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, familyId },
    });
    if (!task) {
      throw new NotFoundException('Không tìm thấy công việc');
    }

    if (dto.taskCategoryId) {
      await this.assertActiveCategoryInFamily(familyId, dto.taskCategoryId);
    }

    const taskCategoryIdProvided = Object.hasOwn(dto, 'taskCategoryId');

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        title: dto.title,
        description: dto.description,
        taskCategoryId: taskCategoryIdProvided
          ? (dto.taskCategoryId ?? null)
          : undefined,
        priority: dto.priority,
        status: dto.status,
        dueAt:
          dto.dueAt === undefined
            ? undefined
            : dto.dueAt
              ? new Date(dto.dueAt)
              : null,
      },
      include: taskInclude,
    });
  }

  async cancelTask(familyId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, familyId },
    });
    if (!task) {
      throw new NotFoundException('Không tìm thấy công việc');
    }

    return this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.CANCELED },
      include: taskInclude,
    });
  }

  private async assertTaskCategoryNameAvailable(
    familyId: string,
    name: string,
    excludeCategoryId?: string,
  ) {
    const duplicate = await this.prisma.taskCategory.findFirst({
      where: {
        familyId,
        name,
        id: excludeCategoryId ? { not: excludeCategoryId } : undefined,
      },
    });
    if (duplicate) {
      throw new ConflictException(
        'Danh mục công việc đã tồn tại trong gia đình này',
      );
    }
  }

  private async assertActiveCategoryInFamily(
    familyId: string,
    categoryId: string,
  ) {
    const category = await this.prisma.taskCategory.findFirst({
      where: {
        id: categoryId,
        familyId,
        status: TaskCategoryStatus.ACTIVE,
      },
    });
    if (!category) {
      throw new BadRequestException(
        'Danh mục công việc không hợp lệ hoặc đã ngừng hoạt động',
      );
    }
  }

  private assertAdHocOnly(taskType?: TaskType) {
    if (taskType === TaskType.RECURRING) {
      throw new BadRequestException(RECURRING_PHASE_MESSAGE);
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
