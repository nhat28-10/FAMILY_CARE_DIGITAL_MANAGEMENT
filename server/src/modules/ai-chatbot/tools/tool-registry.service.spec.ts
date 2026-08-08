import { ForbiddenException } from '@nestjs/common';
import { AiRelatedModule, FamilyRole } from '@prisma/client';

import { AiActionType } from '../types/ai-chatbot.types';
import { ToolRegistryService } from './tool-registry.service';
import type { AiToolDefinition } from './tool.types';
import type { CalendarAiTools } from './calendar.tools';
import type { DailyBriefAiTools } from './daily-brief.tools';
import type { FinanceAiTools } from './finance.tools';
import type { SafetyAiTools } from './safety.tools';
import type { TasksAiTools } from './tasks.tools';

describe('ToolRegistryService', () => {
  const ctx = {
    familyId: 'family-1',
    memberId: 'member-1',
    familyRole: FamilyRole.FAMILY_MANAGER,
  };

  const readExecute = jest.fn();
  const readTool: AiToolDefinition = {
    name: 'read_manager_only',
    description: 'tool đọc chỉ dành cho quản lý',
    parameters: { type: 'object', properties: {} },
    module: AiRelatedModule.FINANCE,
    kind: 'read',
    allowedRoles: [FamilyRole.FAMILY_MANAGER, FamilyRole.DEPUTY_MEMBER],
    execute: readExecute,
  };
  const writeTool: AiToolDefinition = {
    name: 'propose_something',
    description: 'tool ghi',
    parameters: { type: 'object', properties: {} },
    module: AiRelatedModule.TASK,
    kind: 'write',
    allowedRoles: [FamilyRole.FAMILY_MANAGER],
    actionType: AiActionType.CREATE_TASK,
    buildActionPayload: jest.fn(),
  };
  const openTool: AiToolDefinition = {
    name: 'read_everyone',
    description: 'tool đọc cho mọi thành viên',
    parameters: { type: 'object', properties: {} },
    module: AiRelatedModule.SOS,
    kind: 'read',
    allowedRoles: [
      FamilyRole.FAMILY_MANAGER,
      FamilyRole.DEPUTY_MEMBER,
      FamilyRole.FAMILY_MEMBER,
    ],
    execute: jest.fn().mockResolvedValue({ ok: true }),
  };

  const provider = (tools: AiToolDefinition[]) => ({ getTools: () => tools });
  let registry: ToolRegistryService;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new ToolRegistryService(
      provider([readTool, writeTool]) as unknown as FinanceAiTools,
      provider([openTool]) as unknown as TasksAiTools,
      provider([]) as unknown as CalendarAiTools,
      provider([]) as unknown as SafetyAiTools,
      provider([]) as unknown as DailyBriefAiTools,
    );
  });

  describe('getToolsForRole / getOpenAiTools', () => {
    it('FAMILY_MEMBER không nhận tool ngoài quyền', () => {
      const names = registry
        .getToolsForRole(FamilyRole.FAMILY_MEMBER)
        .map((tool) => tool.name);
      expect(names).toEqual(['propose_something', 'read_everyone']);
    });

    it('FAMILY_MANAGER nhận đủ tool, đúng format OpenAI', () => {
      const tools = registry.getOpenAiTools(FamilyRole.FAMILY_MANAGER);
      expect(tools).toHaveLength(3);
      expect(tools[0]).toEqual({
        type: 'function',
        function: {
          name: 'read_manager_only',
          description: 'tool đọc chỉ dành cho quản lý',
          parameters: { type: 'object', properties: {} },
        },
      });
    });
  });

  describe('executeReadTool', () => {
    it('dispatch đúng tool với args đã parse', async () => {
      readExecute.mockResolvedValue({ total: 5 });
      const result = await registry.executeReadTool(
        'read_manager_only',
        '{"month":7}',
        ctx,
      );
      expect(readExecute).toHaveBeenCalledWith({ month: 7 }, ctx);
      expect(result).toEqual({ ok: true, content: '{"total":5}' });
    });

    it('HttpException từ service → { error } tiếng Việt, không throw', async () => {
      readExecute.mockRejectedValue(
        new ForbiddenException('Không có quyền quản lý tài chính gia đình'),
      );
      const result = await registry.executeReadTool(
        'read_manager_only',
        '',
        ctx,
      );
      expect(result.ok).toBe(false);
      expect(JSON.parse(result.content)).toEqual({
        error: 'Không có quyền quản lý tài chính gia đình',
      });
    });

    it('lỗi không xác định → message chung, không lộ chi tiết', async () => {
      readExecute.mockRejectedValue(new Error('DB connection refused'));
      const result = await registry.executeReadTool(
        'read_manager_only',
        '',
        ctx,
      );
      expect(JSON.parse(result.content)).toEqual({
        error: 'Không thể truy xuất dữ liệu',
      });
    });

    it('re-check role khi execute dù model không được gửi tool đó', async () => {
      const result = await registry.executeReadTool('read_manager_only', '', {
        ...ctx,
        familyRole: FamilyRole.FAMILY_MEMBER,
      });
      expect(readExecute).not.toHaveBeenCalled();
      expect(JSON.parse(result.content)).toEqual({
        error: 'Bạn không có quyền truy cập dữ liệu này',
      });
    });

    it('tool write không được execute qua đường read', async () => {
      const result = await registry.executeReadTool(
        'propose_something',
        '',
        ctx,
      );
      expect(JSON.parse(result.content)).toEqual({
        error: 'Công cụ không tồn tại',
      });
    });

    it('args không phải JSON → lỗi tham số', async () => {
      const result = await registry.executeReadTool(
        'read_manager_only',
        '{oops',
        ctx,
      );
      expect(JSON.parse(result.content)).toEqual({
        error: 'Tham số không hợp lệ',
      });
    });

    it('kết quả quá dài bị cắt bớt', async () => {
      readExecute.mockResolvedValue({ blob: 'x'.repeat(10_000) });
      const result = await registry.executeReadTool(
        'read_manager_only',
        '',
        ctx,
      );
      expect(result.content.length).toBeLessThan(8100);
      expect(result.content.endsWith('…(cắt bớt)')).toBe(true);
    });
  });
});
