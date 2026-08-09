import type { AiRelatedModule, FamilyRole } from '@prisma/client';

/** Loại hành động ghi mà AI được phép đề xuất (chờ user xác nhận). */
export enum AiActionType {
  CREATE_LEDGER_ENTRY = 'CREATE_LEDGER_ENTRY',
  CREATE_BUDGET_PLAN = 'CREATE_BUDGET_PLAN',
  CREATE_BUDGET_LINE = 'CREATE_BUDGET_LINE',
  CREATE_FINANCIAL_GOAL = 'CREATE_FINANCIAL_GOAL',
  CREATE_GOAL_ALLOCATION = 'CREATE_GOAL_ALLOCATION',
  CREATE_GOAL_CONTRIBUTION_PLAN = 'CREATE_GOAL_CONTRIBUTION_PLAN',
  ALLOCATE_FUND_BY_MODEL = 'ALLOCATE_FUND_BY_MODEL',
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
  pendingActions?: AiPendingAction[];
  /** Legacy mirror của pendingActions[0], giữ cho FE cũ/backward-compatible. */
  pendingAction?: AiPendingAction;
}

/** Bản tóm tắt đề xuất trả cho client để render nút xác nhận. */
export interface AiPendingActionPreview {
  messageId: string;
  actionIndex: number;
  actionType: AiActionType;
  preview: Record<string, unknown>;
  expiresAt: string;
  status: AiActionStatus;
  uiHints: AiPendingActionUiHints;
  result?: { id: string };
}

export type AiMessageDisplayStyle =
  | 'TEXT'
  | 'INSIGHT_CARD'
  | 'ACTION_CARD'
  | 'ACTION_PLAN_CARD'
  | 'RESULT_CARD'
  | 'PERMISSION_NOTICE';

export type AiUiIntent =
  | 'GENERAL'
  | 'INSIGHT'
  | 'ACTION_PROPOSAL'
  | 'ACTION_PLAN'
  | 'ACTION_RESULT'
  | 'PERMISSION_LIMIT';

export interface AiQuickAction {
  label: string;
  prompt: string;
  relatedModule: AiRelatedModule;
}

export interface AiActionPreviewField {
  label: string;
  value: string;
}

export interface AiPendingActionUiHints {
  title: string;
  description: string;
  icon: 'wallet' | 'check-square' | 'calendar' | 'sparkles';
  primaryActionLabel: string;
  secondaryActionLabel: string;
  editActionLabel: string;
  fields: AiActionPreviewField[];
}

export interface AiMessageUiHints {
  displayStyle: AiMessageDisplayStyle;
  intent: AiUiIntent;
  title: string;
  icon: 'bot' | 'wallet' | 'check-square' | 'calendar' | 'shield' | 'sparkles';
  confidenceLabel: 'Tham khảo' | 'Có dữ liệu' | 'Chờ xác nhận';
  quickActions: AiQuickAction[];
}

export interface AiSendMessageResult {
  userMessage: AiMessageView;
  aiMessage: AiMessageView;
  /** Legacy alias của pendingActions[0]. */
  pendingAction: AiPendingActionPreview | null;
  pendingActions: AiPendingActionPreview[];
}

export interface AiMessageView {
  id: string;
  senderType: string;
  content: string;
  relatedModule: AiRelatedModule | null;
  createdAt: Date;
  pendingAction?: AiPendingActionPreview | null;
  pendingActions?: AiPendingActionPreview[];
  uiHints?: AiMessageUiHints;
}
