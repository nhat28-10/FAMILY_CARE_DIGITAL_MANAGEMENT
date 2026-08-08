import { HttpException, Injectable, Logger } from '@nestjs/common';
import type { FamilyRole } from '@prisma/client';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

import type { AiToolContext } from '../types/ai-chatbot.types';
import type { AiToolDefinition } from './tool.types';
import { CalendarAiTools } from './calendar.tools';
import { DailyBriefAiTools } from './daily-brief.tools';
import { FinanceAiTools } from './finance.tools';
import { SafetyAiTools } from './safety.tools';
import { TasksAiTools } from './tasks.tools';

/** Giới hạn kích thước kết quả tool đưa lại cho model (ký tự JSON). */
const TOOL_RESULT_MAX_CHARS = 8000;

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly tools = new Map<string, AiToolDefinition>();

  constructor(
    financeTools: FinanceAiTools,
    tasksTools: TasksAiTools,
    calendarTools: CalendarAiTools,
    safetyTools: SafetyAiTools,
    dailyBriefTools: DailyBriefAiTools,
  ) {
    for (const provider of [
      financeTools,
      tasksTools,
      calendarTools,
      safetyTools,
      dailyBriefTools,
    ]) {
      for (const tool of provider.getTools()) {
        this.tools.set(tool.name, tool);
      }
    }
  }

  /** Tool member này được dùng — tool ngoài quyền không gửi cho model. */
  getToolsForRole(familyRole: FamilyRole): AiToolDefinition[] {
    // Hide unauthorized read tools, but expose write tools so permission
    // denials are explicit instead of being guessed by the model.
    return [...this.tools.values()].filter(
      (tool) => tool.kind === 'write' || tool.allowedRoles.includes(familyRole),
    );
  }

  /** Chuyển sang format tools của OpenAI chat completions. */
  getOpenAiTools(familyRole: FamilyRole): ChatCompletionTool[] {
    return this.getToolsForRole(familyRole).map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  getTool(name: string): AiToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Thực thi tool ĐỌC, trả chuỗi JSON đưa lại cho model. Mọi lỗi được nuốt
   * thành `{ error }` để model tự giải thích — không abort lượt chat.
   */
  async executeReadTool(
    name: string,
    rawArgs: string,
    ctx: AiToolContext,
  ): Promise<{ ok: boolean; content: string }> {
    const tool = this.tools.get(name);
    if (!tool || tool.kind !== 'read' || !tool.execute) {
      return this.errorResult('Công cụ không tồn tại');
    }
    // Defense in depth: registry đã lọc theo role khi gửi tools, vẫn re-check.
    if (!tool.allowedRoles.includes(ctx.familyRole)) {
      return this.errorResult('Bạn không có quyền truy cập dữ liệu này');
    }
    let args: Record<string, unknown>;
    try {
      args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
    } catch {
      return this.errorResult('Tham số không hợp lệ');
    }
    try {
      const result = await tool.execute(args, ctx);
      const json = JSON.stringify(result ?? null);
      return {
        ok: true,
        content:
          json.length > TOOL_RESULT_MAX_CHARS
            ? `${json.slice(0, TOOL_RESULT_MAX_CHARS)}…(cắt bớt)`
            : json,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        // Message service đã là tiếng Việt và an toàn để lộ cho model.
        return this.errorResult(error.message);
      }
      this.logger.error(
        `Tool ${name} lỗi không xác định: ${
          error instanceof Error ? error.stack : String(error)
        }`,
      );
      return this.errorResult('Không thể truy xuất dữ liệu');
    }
  }

  private errorResult(message: string): { ok: false; content: string } {
    return { ok: false, content: JSON.stringify({ error: message }) };
  }
}
