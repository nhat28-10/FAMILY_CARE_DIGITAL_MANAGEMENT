import { Injectable } from '@nestjs/common';
import {
  AiRelatedModule,
  FamilyRole,
  TaskAssignmentStatus,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';

import { CreateTaskAssignmentDto } from '../../tasks/dto/create-task-assignment.dto';
import { CreateTaskDto } from '../../tasks/dto/create-task.dto';
import { TasksService } from '../../tasks/services/tasks.service';
import { FamilyMembersService } from '../../family-members/family-members.service';
import { AiActionType } from '../types/ai-chatbot.types';
import type { AiToolDefinition, AiToolProvider } from './tool.types';
import { validateActionArgs } from './validate-action-args';

const ALL_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
  FamilyRole.FAMILY_MEMBER,
];

// Mirror TASK_MANAGER_ROLES trong tasks/controllers/tasks.controller.ts.
const TASK_MANAGER_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
];

const MAX_LIST_LIMIT = 20;

function clampLimit(value: unknown): number {
  const parsed = typeof value === 'number' ? Math.floor(value) : NaN;
  if (Number.isNaN(parsed) || parsed < 1) return MAX_LIST_LIMIT;
  return Math.min(parsed, MAX_LIST_LIMIT);
}

function enumOrUndefined<T extends Record<string, string>>(
  enumObject: T,
  value: unknown,
): T[keyof T] | undefined {
  return typeof value === 'string' && Object.values(enumObject).includes(value)
    ? (value as T[keyof T])
    : undefined;
}

@Injectable()
export class TasksAiTools implements AiToolProvider {
  constructor(
    private readonly tasksService: TasksService,
    private readonly familyMembersService: FamilyMembersService,
  ) {}

  getTools(): AiToolDefinition[] {
    return [
      {
        name: 'list_my_tasks',
        description:
          'Danh sách công việc được giao cho CHÍNH người đang hỏi (kèm hạn hoàn thành, trạng thái). Dùng khi hỏi "tôi còn việc gì / con còn task nào chưa làm" (khi chính người đó hỏi).',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: Object.values(TaskAssignmentStatus),
              description: 'Lọc theo trạng thái phân công',
            },
            limit: { type: 'integer', minimum: 1, maximum: MAX_LIST_LIMIT },
          },
          additionalProperties: false,
        },
        module: AiRelatedModule.TASK,
        kind: 'read',
        allowedRoles: ALL_ROLES,
        execute: (args, ctx) =>
          this.tasksService.listMyTaskAssignments(ctx.familyId, ctx.memberId, {
            page: 1,
            limit: clampLimit(args.limit),
            status: enumOrUndefined(TaskAssignmentStatus, args.status),
          }),
      },
      {
        name: 'list_family_tasks',
        description:
          'Danh sách công việc của cả gia đình (mọi thành viên xem được). Dùng khi hỏi tổng quan việc nhà.',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: Object.values(TaskStatus),
              description: 'Lọc theo trạng thái công việc',
            },
            priority: {
              type: 'string',
              enum: Object.values(TaskPriority),
              description: 'Lọc theo mức độ ưu tiên',
            },
            limit: { type: 'integer', minimum: 1, maximum: MAX_LIST_LIMIT },
          },
          additionalProperties: false,
        },
        module: AiRelatedModule.TASK,
        kind: 'read',
        allowedRoles: ALL_ROLES,
        execute: (args, ctx) =>
          this.tasksService.listTasks(
            ctx.familyId,
            {
              page: 1,
              limit: clampLimit(args.limit),
              status: enumOrUndefined(TaskStatus, args.status),
              priority: enumOrUndefined(TaskPriority, args.priority),
            },
            ctx.memberId,
            ctx.familyRole,
          ),
      },
      {
        name: 'list_family_members',
        description:
          'Danh sách thành viên gia đình (id, tên, vai trò, quan hệ) — dùng để tra memberId khi cần giao việc cho ai đó ("giao cho mẹ").',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        module: AiRelatedModule.GENERAL,
        kind: 'read',
        allowedRoles: ALL_ROLES,
        execute: async (_args, ctx) => {
          const members = await this.familyMembersService.listByFamily(
            ctx.familyId,
          );
          return members.map((member) => ({
            id: member.id,
            displayName:
              member.displayName ?? member.user.fullName ?? member.user.email,
            familyRole: member.familyRole,
            relationship: member.relationship,
          }));
        },
      },
      {
        name: 'propose_create_task',
        description:
          'ĐỀ XUẤT tạo công việc mới, tùy chọn giao luôn cho một thành viên (người dùng phải bấm xác nhận mới tạo). Cần assignedToMemberId thì tra list_family_members trước.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              maxLength: 150,
              description: 'Tên công việc',
            },
            description: { type: 'string', maxLength: 1000 },
            priority: {
              type: 'string',
              enum: Object.values(TaskPriority),
              description: 'Mức độ ưu tiên (mặc định MEDIUM)',
            },
            dueAt: {
              type: 'string',
              description: 'Hạn hoàn thành ISO 8601 nếu người dùng có nói',
            },
            assignedToMemberId: {
              type: 'string',
              description:
                'UUID thành viên được giao (lấy từ list_family_members); bỏ trống nếu chưa giao ai',
            },
          },
          required: ['title'],
          additionalProperties: false,
        },
        module: AiRelatedModule.TASK,
        kind: 'write',
        allowedRoles: TASK_MANAGER_ROLES,
        actionType: AiActionType.CREATE_TASK,
        buildActionPayload: (args) => {
          const { assignedToMemberId, ...taskArgs } = args;
          const task = validateActionArgs(CreateTaskDto, taskArgs);
          let assignment: CreateTaskAssignmentDto | undefined;
          if (assignedToMemberId !== undefined) {
            assignment = validateActionArgs(CreateTaskAssignmentDto, {
              assignedToMemberId,
              dueAt: task.dueAt,
            });
          }
          return Promise.resolve({
            task: { ...task },
            assignment: assignment ? { ...assignment } : undefined,
          });
        },
      },
    ];
  }
}
