import { AiRelatedModule, AiSenderType, FamilyRole } from '@prisma/client';
import type { AIMessage } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { AiActionStatus, AiActionType } from '../types/ai-chatbot.types';
import { AiConversationsService } from './ai-conversations.service';

const buildAiMessage = (overrides: Partial<AIMessage> = {}): AIMessage => ({
  id: 'msg-1',
  aiConversationId: 'conv-1',
  senderType: AiSenderType.AI,
  messageContent: 'Mình đã chuẩn bị một đề xuất, bạn xác nhận nhé.',
  relatedModule: AiRelatedModule.FINANCE,
  createdAt: new Date('2026-08-08T00:00:00.000Z'),
  permissionContext: null,
  ...overrides,
});

describe('AiConversationsService UI hints', () => {
  let service: AiConversationsService;

  beforeEach(() => {
    service = new AiConversationsService({} as PrismaService);
  });

  it('maps pending action to an action card with confirm labels and preview fields', () => {
    const message = buildAiMessage({
      permissionContext: {
        familyRole: FamilyRole.FAMILY_MANAGER,
        toolTrace: [],
        pendingAction: {
          actionType: AiActionType.CREATE_LEDGER_ENTRY,
          payload: {
            entryType: 'EXPENSE',
            amount: 200000,
            description: 'tiền chợ',
            entryDate: '2026-08-08T00:00:00.000Z',
          },
          status: AiActionStatus.PENDING,
          proposedByMemberId: 'member-1',
          expiresAt: '2026-08-08T00:15:00.000Z',
        },
      },
    });

    const view = service.toMessageView(message);

    expect(view.uiHints).toMatchObject({
      displayStyle: 'ACTION_CARD',
      intent: 'ACTION_PROPOSAL',
      title: 'Đề xuất cần bạn xác nhận',
      confidenceLabel: 'Chờ xác nhận',
    });
    expect(view.pendingAction?.uiHints).toMatchObject({
      title: 'Tạo giao dịch tài chính',
      primaryActionLabel: 'Xác nhận ghi sổ',
      secondaryActionLabel: 'Hủy đề xuất',
    });
    expect(view.pendingAction?.uiHints.fields).toEqual(
      expect.arrayContaining([
        { label: 'Số tiền', value: '200.000đ' },
        { label: 'Nội dung', value: 'tiền chợ' },
      ]),
    );
  });

  it('maps permission text to a permission notice without action CTA', () => {
    const view = service.toMessageView(
      buildAiMessage({
        messageContent: 'Bạn không có quyền ghi khoản thu/chi vào sổ chung.',
        relatedModule: AiRelatedModule.GENERAL,
      }),
    );

    expect(view.pendingAction).toBeNull();
    expect(view.uiHints).toMatchObject({
      displayStyle: 'PERMISSION_NOTICE',
      intent: 'PERMISSION_LIMIT',
      icon: 'shield',
    });
  });

  it('maps multiple pending actions to an action plan card', () => {
    const view = service.toMessageView(
      buildAiMessage({
        permissionContext: {
          familyRole: FamilyRole.FAMILY_MANAGER,
          toolTrace: [],
          pendingActions: [
            {
              actionType: AiActionType.CREATE_FINANCIAL_GOAL,
              payload: {
                goalName: 'Quỹ dự phòng',
                targetAmount: 20000000,
              },
              status: AiActionStatus.PENDING,
              proposedByMemberId: 'member-1',
              expiresAt: '2026-08-08T00:15:00.000Z',
            },
            {
              actionType: AiActionType.CREATE_TASK,
              payload: {
                task: { title: 'Nhắc đóng góp quỹ dự phòng' },
              },
              status: AiActionStatus.PENDING,
              proposedByMemberId: 'member-1',
              expiresAt: '2026-08-08T00:15:00.000Z',
            },
          ],
        },
      }),
    );

    expect(view.pendingAction?.actionIndex).toBe(0);
    expect(view.pendingActions).toHaveLength(2);
    expect(view.pendingActions?.[1].actionIndex).toBe(1);
    expect(view.uiHints).toMatchObject({
      displayStyle: 'ACTION_PLAN_CARD',
      intent: 'ACTION_PLAN',
      title: 'Kế hoạch AI đề xuất',
      confidenceLabel: 'Chờ xác nhận',
    });
  });

  it('maps successful daily brief tool trace to an insight card', () => {
    const view = service.toMessageView(
      buildAiMessage({
        messageContent: 'Tổng quan hôm nay của gia đình mình.',
        relatedModule: AiRelatedModule.GENERAL,
        permissionContext: {
          familyRole: FamilyRole.FAMILY_MEMBER,
          toolTrace: [
            {
              tool: 'get_daily_brief',
              args: {},
              ok: true,
              durationMs: 12,
            },
          ],
        },
      }),
    );

    expect(view.pendingAction).toBeNull();
    expect(view.uiHints).toMatchObject({
      displayStyle: 'INSIGHT_CARD',
      intent: 'INSIGHT',
      title: 'Tổng quan hôm nay',
      icon: 'sparkles',
      confidenceLabel: 'Có dữ liệu',
    });
  });
});
