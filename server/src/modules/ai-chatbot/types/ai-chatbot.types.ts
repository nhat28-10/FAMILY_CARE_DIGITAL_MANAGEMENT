import type { AiRelatedModule, FamilyRole } from '@prisma/client';

/** Loại hành động ghi mà AI được phép đề xuất (chờ user xác nhận). */
export enum AiActionType {
  CREATE_LEDGER_ENTRY = 'CREATE_LEDGER_ENTRY',
  CREATE_TASK = 'CREATE_TASK',
  CREATE_CALENDAR_EVENT = 'CREATE_CALENDAR_EVENT',
}

export enum AiActionStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

/** Ngữ cảnh thực thi tool — mọi tool chỉ được nhìn trong phạm vi này. */
export interface AiToolContext {
  familyId: string;
  memberId: string;
  familyRole: FamilyRole;
}

/** Vết gọi tool lưu vào permissionContext để audit/debug (không lưu full result). */
export interface AiToolTrace {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  durationMs: number;
}

/** Đề xuất hành động ghi, lưu trong AIMessage.permissionContext.pendingAction. */
export interface AiPendingAction {
  actionType: AiActionType;
  /** Args đã validate bằng DTO thật — payload sẽ đưa thẳng vào service khi confirm. */
  payload: Record<string, unknown>;
  status: AiActionStatus;
  proposedByMemberId: string;
  expiresAt: string; // ISO
  /** Kết quả sau khi confirm (id bản ghi đã tạo). */
  result?: { id: string };
}

/** Cấu trúc Json lưu vào AIMessage.permissionContext của message AI. */
export interface AiPermissionContext {
  familyRole: FamilyRole;
  toolTrace: AiToolTrace[];
  pendingAction?: AiPendingAction;
}

/** Bản tóm tắt đề xuất trả cho client để render nút xác nhận. */
export interface AiPendingActionPreview {
  messageId: string;
  actionType: AiActionType;
  preview: Record<string, unknown>;
  expiresAt: string;
}

export interface AiSendMessageResult {
  userMessage: AiMessageView;
  aiMessage: AiMessageView;
  pendingAction: AiPendingActionPreview | null;
}

export interface AiMessageView {
  id: string;
  senderType: string;
  content: string;
  relatedModule: AiRelatedModule | null;
  createdAt: Date;
}
