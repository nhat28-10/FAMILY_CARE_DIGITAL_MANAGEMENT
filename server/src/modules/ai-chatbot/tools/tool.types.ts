import type { AiRelatedModule, FamilyRole } from '@prisma/client';
import type { AiActionType, AiToolContext } from '../types/ai-chatbot.types';

/**
 * Định nghĩa một tool cho OpenAI function calling.
 * - Tool `read`: có `execute`, chạy ngay trong lượt chat.
 * - Tool `write`: có `actionType`, KHÔNG execute — chỉ tạo đề xuất chờ xác nhận.
 */
export interface AiToolDefinition {
  name: string;
  /** Mô tả cho model biết khi nào dùng (ghi rõ bằng tiếng Việt càng tốt). */
  description: string;
  /** JSON Schema của arguments. */
  parameters: Record<string, unknown>;
  module: AiRelatedModule;
  kind: 'read' | 'write';
  /** Mirror đúng role gating của REST endpoint tương ứng. */
  allowedRoles: FamilyRole[];
  execute?: (
    args: Record<string, unknown>,
    ctx: AiToolContext,
  ) => Promise<unknown>;
  actionType?: AiActionType;
  /**
   * Với tool write: validate + chuẩn hóa args thành payload sẽ lưu vào
   * pendingAction (throw BadRequestException message tiếng Việt nếu sai).
   */
  buildActionPayload?: (
    args: Record<string, unknown>,
    ctx: AiToolContext,
  ) => Promise<Record<string, unknown>>;
}

/** Provider gom tool theo domain (finance/tasks/safety). */
export interface AiToolProvider {
  getTools(): AiToolDefinition[];
}
