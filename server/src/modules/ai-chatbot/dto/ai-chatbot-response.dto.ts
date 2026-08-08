import { ApiProperty } from '@nestjs/swagger';
import { AiRelatedModule, AiSenderType } from '@prisma/client';

import { AiActionStatus, AiActionType } from '../types/ai-chatbot.types';

class PaginationMetaResponseDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

class AiActionResultResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
}

class AiQuickActionResponseDto {
  @ApiProperty({ example: 'Phân tích chi tiêu' })
  label!: string;

  @ApiProperty({
    example: 'Phân tích chi tiêu tháng này và chỉ ra khoản bất thường.',
  })
  prompt!: string;

  @ApiProperty({ enum: AiRelatedModule, enumName: 'AiRelatedModule' })
  relatedModule!: AiRelatedModule;
}

class AiActionPreviewFieldResponseDto {
  @ApiProperty({ example: 'Số tiền' })
  label!: string;

  @ApiProperty({ example: '200.000đ' })
  value!: string;
}

class AiPendingActionUiHintsResponseDto {
  @ApiProperty({ example: 'Tạo giao dịch tài chính' })
  title!: string;

  @ApiProperty({
    example: 'AI đã chuẩn bị bản nháp giao dịch. Chỉ ghi sổ khi bạn xác nhận.',
  })
  description!: string;

  @ApiProperty({ example: 'wallet' })
  icon!: string;

  @ApiProperty({ example: 'Xác nhận ghi sổ' })
  primaryActionLabel!: string;

  @ApiProperty({ example: 'Hủy đề xuất' })
  secondaryActionLabel!: string;

  @ApiProperty({ example: 'Chỉnh trước khi ghi' })
  editActionLabel!: string;

  @ApiProperty({ type: () => [AiActionPreviewFieldResponseDto] })
  fields!: AiActionPreviewFieldResponseDto[];
}

class AiMessageUiHintsResponseDto {
  @ApiProperty({
    enum: [
      'TEXT',
      'INSIGHT_CARD',
      'ACTION_CARD',
      'ACTION_PLAN_CARD',
      'RESULT_CARD',
      'PERMISSION_NOTICE',
    ],
    example: 'ACTION_CARD',
  })
  displayStyle!: string;

  @ApiProperty({
    enum: [
      'GENERAL',
      'INSIGHT',
      'ACTION_PROPOSAL',
      'ACTION_PLAN',
      'ACTION_RESULT',
      'PERMISSION_LIMIT',
    ],
    example: 'ACTION_PROPOSAL',
  })
  intent!: string;

  @ApiProperty({ example: 'Đề xuất cần bạn xác nhận' })
  title!: string;

  @ApiProperty({ example: 'wallet' })
  icon!: string;

  @ApiProperty({ example: 'Chờ xác nhận' })
  confidenceLabel!: string;

  @ApiProperty({ type: () => [AiQuickActionResponseDto] })
  quickActions!: AiQuickActionResponseDto[];
}

export class AiPendingActionResponseDto {
  @ApiProperty({ format: 'uuid' })
  messageId!: string;

  @ApiProperty({
    example: 0,
    description:
      'Index của action trong pendingActions. Dùng endpoint Sprint 3 để confirm/reject từng bước.',
  })
  actionIndex!: number;

  @ApiProperty({ enum: AiActionType, enumName: 'AiActionType' })
  actionType!: AiActionType;

  @ApiProperty({ enum: AiActionStatus, enumName: 'AiActionStatus' })
  status!: AiActionStatus;

  @ApiProperty({
    type: Object,
    description:
      'Validated action payload preview. Shape depends on actionType.',
    example: {
      entryType: 'EXPENSE',
      amount: 200000,
      description: 'An toi',
      entryDate: '2026-08-07T12:00:00.000Z',
    },
  })
  preview!: Record<string, unknown>;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      'ISO UTC expiration timestamp, produced with Date.toISOString().',
    example: '2026-08-07T12:15:00.000Z',
  })
  expiresAt!: string;

  @ApiProperty({
    type: () => AiPendingActionUiHintsResponseDto,
    description:
      'UI metadata for rendering a confirm/reject preview card without parsing text.',
  })
  uiHints!: AiPendingActionUiHintsResponseDto;

  @ApiProperty({
    type: () => AiActionResultResponseDto,
    required: false,
    description: 'Present after status CONFIRMED.',
  })
  result?: AiActionResultResponseDto;
}

export class AiMessageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: AiSenderType })
  senderType!: AiSenderType;

  @ApiProperty()
  content!: string;

  @ApiProperty({ enum: AiRelatedModule, nullable: true })
  relatedModule!: AiRelatedModule | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: () => AiPendingActionResponseDto, nullable: true })
  pendingAction!: AiPendingActionResponseDto | null;

  @ApiProperty({
    type: () => [AiPendingActionResponseDto],
    description:
      'Sprint 3: danh sách action trong một action plan. pendingAction là alias của item đầu tiên để tương thích FE cũ.',
  })
  pendingActions!: AiPendingActionResponseDto[];

  @ApiProperty({
    type: () => AiMessageUiHintsResponseDto,
    description:
      'UI metadata for rich AI cards, contextual quick actions, and state labels.',
  })
  uiHints!: AiMessageUiHintsResponseDto;
}

export class AiConversationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  workspaceId!: string;

  @ApiProperty({ format: 'uuid' })
  memberId!: string;

  @ApiProperty({ type: String, nullable: true })
  conversationTitle!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

class AiConversationLastMessageResponseDto {
  @ApiProperty({ enum: AiSenderType })
  senderType!: AiSenderType;

  @ApiProperty()
  messageContent!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

class AiConversationListItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  conversationTitle!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({
    type: () => AiConversationLastMessageResponseDto,
    nullable: true,
  })
  lastMessage!: AiConversationLastMessageResponseDto | null;
}

class AiConversationListDataResponseDto {
  @ApiProperty({ type: () => [AiConversationListItemResponseDto] })
  items!: AiConversationListItemResponseDto[];

  @ApiProperty({ type: () => PaginationMetaResponseDto })
  meta!: PaginationMetaResponseDto;
}

class AiMessageListDataResponseDto {
  @ApiProperty({ type: () => [AiMessageResponseDto] })
  items!: AiMessageResponseDto[];

  @ApiProperty({ type: () => PaginationMetaResponseDto })
  meta!: PaginationMetaResponseDto;
}

class AiSendMessageDataResponseDto {
  @ApiProperty({ type: () => AiMessageResponseDto })
  userMessage!: AiMessageResponseDto;

  @ApiProperty({ type: () => AiMessageResponseDto })
  aiMessage!: AiMessageResponseDto;

  @ApiProperty({ type: () => AiPendingActionResponseDto, nullable: true })
  pendingAction!: AiPendingActionResponseDto | null;

  @ApiProperty({ type: () => [AiPendingActionResponseDto] })
  pendingActions!: AiPendingActionResponseDto[];
}

class AiConfirmActionDataResponseDto {
  @ApiProperty({ example: 0 })
  actionIndex!: number;

  @ApiProperty({ enum: AiActionType, enumName: 'AiActionType' })
  actionType!: AiActionType;

  @ApiProperty({ type: () => AiActionResultResponseDto })
  result!: AiActionResultResponseDto;
}

class AiRejectActionDataResponseDto {
  @ApiProperty({ example: 0 })
  actionIndex!: number;

  @ApiProperty({ enum: AiActionType, enumName: 'AiActionType' })
  actionType!: AiActionType;
}

class AiDeleteConversationDataResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
}

export class AiConversationApiResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: () => AiConversationResponseDto })
  data!: AiConversationResponseDto;
}

export class AiConversationListApiResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: () => AiConversationListDataResponseDto })
  data!: AiConversationListDataResponseDto;
}

export class AiMessageListApiResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: () => AiMessageListDataResponseDto })
  data!: AiMessageListDataResponseDto;
}

export class AiSendMessageApiResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: () => AiSendMessageDataResponseDto })
  data!: AiSendMessageDataResponseDto;
}

export class AiConfirmActionApiResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: () => AiConfirmActionDataResponseDto })
  data!: AiConfirmActionDataResponseDto;
}

export class AiRejectActionApiResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: () => AiRejectActionDataResponseDto })
  data!: AiRejectActionDataResponseDto;
}

export class AiDeleteConversationApiResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: () => AiDeleteConversationDataResponseDto })
  data!: AiDeleteConversationDataResponseDto;
}
