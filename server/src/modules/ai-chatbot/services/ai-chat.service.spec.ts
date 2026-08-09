import { BadGatewayException } from '@nestjs/common';
import { AiRelatedModule, AiSenderType, FamilyRole } from '@prisma/client';
import type { FamilyMember } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { AiActionStatus, AiActionType } from '../types/ai-chatbot.types';
import { AiChatService } from './ai-chat.service';
import { AiConversationsService } from './ai-conversations.service';
import { OpenAiClientService } from './openai-client.service';

const familyId = 'family-1';
const conversationId = 'conv-1';
const member = {
  id: 'member-1',
  displayName: 'Bố',
  familyRole: FamilyRole.FAMILY_MANAGER,
} as FamilyMember;

/** Dựng completion tối giản như OpenAI trả về. */
const textCompletion = (content: string) => ({
  choices: [{ message: { role: 'assistant', content, tool_calls: null } }],
});
const toolCallCompletion = (name: string, args: object) => ({
  choices: [
    {
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      },
    },
  ],
});

describe('AiChatService', () => {
  let prisma: {
    aIMessage: { create: jest.Mock; findMany: jest.Mock };
    family: { findUnique: jest.Mock };
  };
  let conversations: {
    getOwnedConversationOrThrow: jest.Mock;
    ensureTitle: jest.Mock;
    toMessageView: jest.Mock;
    toPendingActionView: jest.Mock;
  };
  let openAiClient: { chat: jest.Mock; config: Record<string, unknown> };
  let toolRegistry: {
    getOpenAiTools: jest.Mock;
    getTool: jest.Mock;
    executeReadTool: jest.Mock;
  };
  let service: AiChatService;

  beforeEach(() => {
    let messageSeq = 0;
    prisma = {
      aIMessage: {
        create: jest.fn().mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({
            id: `msg-${++messageSeq}`,
            createdAt: new Date(),
            relatedModule: null,
            permissionContext: null,
            ...data,
          }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      family: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Gia đình Bin' }),
      },
    };
    conversations = {
      getOwnedConversationOrThrow: jest
        .fn()
        .mockResolvedValue({ id: conversationId, conversationTitle: 'x' }),
      ensureTitle: jest.fn().mockResolvedValue(undefined),
      toMessageView: jest.fn((message: { id: string }) => message),
      toPendingActionView: jest.fn(
        (messageId: string, action: object, actionIndex = 0) => ({
          messageId,
          actionIndex,
          ...action,
        }),
      ),
    };
    openAiClient = {
      chat: jest.fn(),
      config: {
        maxToolRounds: 5,
        maxHistoryMessages: 20,
        actionExpiresMinutes: 15,
      },
    };
    toolRegistry = {
      getOpenAiTools: jest.fn().mockReturnValue([]),
      getTool: jest.fn(),
      executeReadTool: jest.fn(),
    };
    service = new AiChatService(
      prisma as unknown as PrismaService,
      conversations as unknown as AiConversationsService,
      openAiClient as unknown as OpenAiClientService,
      toolRegistry as unknown as ToolRegistryService,
    );
  });

  const send = (currentMember: FamilyMember = member) =>
    service.sendMessage(familyId, currentMember, conversationId, {
      content: 'câu hỏi',
    });

  it('trả lời thường: lưu đúng 2 message USER + AI, relatedModule GENERAL', async () => {
    openAiClient.chat.mockResolvedValue(textCompletion('Chào bạn!'));

    const result = await send();

    expect(prisma.aIMessage.create).toHaveBeenCalledTimes(2);
    const aiRow = prisma.aIMessage.create.mock.calls[1][0].data;
    expect(aiRow.senderType).toBe(AiSenderType.AI);
    expect(aiRow.messageContent).toBe('Chào bạn!');
    expect(aiRow.relatedModule).toBe(AiRelatedModule.GENERAL);
    expect(result.pendingAction).toBeNull();
  });

  it('một vòng read tool rồi trả lời: relatedModule theo module tool', async () => {
    toolRegistry.getTool.mockReturnValue({
      name: 'get_finance_overview',
      kind: 'read',
      module: AiRelatedModule.FINANCE,
      allowedRoles: [FamilyRole.FAMILY_MANAGER],
    });
    toolRegistry.executeReadTool.mockResolvedValue({
      ok: true,
      content: '{"total":100}',
    });
    openAiClient.chat
      .mockResolvedValueOnce(toolCallCompletion('get_finance_overview', {}))
      .mockResolvedValueOnce(textCompletion('Tháng này chi 100đ.'));

    await send();

    expect(toolRegistry.executeReadTool).toHaveBeenCalledWith(
      'get_finance_overview',
      '{}',
      { familyId, memberId: member.id, familyRole: member.familyRole },
    );
    const aiRow = prisma.aIMessage.create.mock.calls[1][0].data;
    expect(aiRow.relatedModule).toBe(AiRelatedModule.FINANCE);
    expect(aiRow.permissionContext.toolTrace).toHaveLength(1);
  });

  it('write tool: tạo pendingAction PENDING, KHÔNG thực thi, ép text round sau', async () => {
    const buildActionPayload = jest
      .fn()
      .mockResolvedValue({ amount: 50000, description: 'ăn sáng' });
    toolRegistry.getTool.mockReturnValue({
      name: 'propose_create_ledger_entry',
      kind: 'write',
      module: AiRelatedModule.FINANCE,
      allowedRoles: [FamilyRole.FAMILY_MANAGER],
      actionType: AiActionType.CREATE_LEDGER_ENTRY,
      buildActionPayload,
    });
    openAiClient.chat
      .mockResolvedValueOnce(
        toolCallCompletion('propose_create_ledger_entry', {
          amount: 50000,
          description: 'ăn sáng',
        }),
      )
      .mockResolvedValueOnce(
        textCompletion('Mình đã tạo đề xuất, bạn xác nhận nhé.'),
      );

    const result = await send();

    expect(buildActionPayload).toHaveBeenCalled();
    const aiRow = prisma.aIMessage.create.mock.calls[1][0].data;
    expect(aiRow.permissionContext.pendingAction.status).toBe(
      AiActionStatus.PENDING,
    );
    expect(aiRow.permissionContext.pendingAction.proposedByMemberId).toBe(
      member.id,
    );
    expect(aiRow.permissionContext.pendingActions).toHaveLength(1);
    expect(result.pendingAction).not.toBeNull();
    expect(result.pendingActions).toHaveLength(1);
    // Round 2 phải bị ép tool_choice 'none' vì đã có đề xuất.
    expect(openAiClient.chat.mock.calls[1][2]).toBe('none');
  });

  it('nhiều write tool trong cùng lượt được gom thành pendingActions', async () => {
    const buildActionPayload = jest.fn().mockResolvedValue({ a: 1 });
    toolRegistry.getTool.mockReturnValue({
      name: 'propose_create_ledger_entry',
      kind: 'write',
      module: AiRelatedModule.FINANCE,
      allowedRoles: [FamilyRole.FAMILY_MANAGER],
      actionType: AiActionType.CREATE_LEDGER_ENTRY,
      buildActionPayload,
    });
    openAiClient.chat
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [1, 2].map((n) => ({
                id: `call-${n}`,
                type: 'function',
                function: {
                  name: 'propose_create_ledger_entry',
                  arguments: '{}',
                },
              })),
            },
          },
        ],
      })
      .mockResolvedValueOnce(textCompletion('Đã tạo kế hoạch gồm 2 đề xuất.'));

    const result = await send();

    expect(buildActionPayload).toHaveBeenCalledTimes(2);
    const aiRow = prisma.aIMessage.create.mock.calls[1][0].data;
    expect(aiRow.permissionContext.pendingActions).toHaveLength(2);
    expect(aiRow.permissionContext.pendingAction).toEqual(
      aiRow.permissionContext.pendingActions[0],
    );
    expect(result.pendingAction?.actionIndex).toBe(0);
    expect(result.pendingActions).toHaveLength(2);
    expect(result.pendingActions[1].actionIndex).toBe(1);
  });

  it('member write tool bi tu choi quyen thi khong tra pendingAction', async () => {
    const normalMember = {
      ...member,
      id: 'member-normal',
      familyRole: FamilyRole.FAMILY_MEMBER,
    } as FamilyMember;
    const buildActionPayload = jest.fn();
    toolRegistry.getTool.mockReturnValue({
      name: 'propose_create_ledger_entry',
      kind: 'write',
      module: AiRelatedModule.FINANCE,
      allowedRoles: [FamilyRole.FAMILY_MANAGER, FamilyRole.DEPUTY_MEMBER],
      actionType: AiActionType.CREATE_LEDGER_ENTRY,
      buildActionPayload,
    });
    openAiClient.chat
      .mockResolvedValueOnce(
        toolCallCompletion('propose_create_ledger_entry', {
          amount: 200000,
          description: 'an toi',
        }),
      )
      .mockResolvedValueOnce(
        textCompletion(
          'Toi da ghi nhan khoan chi 200.000 VND, vui long xac nhan tren ung dung nhe.',
        ),
      );

    const result = await send(normalMember);

    expect(result.pendingAction).toBeNull();
    expect(buildActionPayload).not.toHaveBeenCalled();
    const aiRow = prisma.aIMessage.create.mock.calls[1][0].data;
    expect(aiRow.messageContent).toContain('khong co quyen ghi khoan thu/chi');
    expect(aiRow.permissionContext.pendingAction).toBeUndefined();
  });

  it('hết round budget vẫn trả text (gọi cuối tool_choice none)', async () => {
    toolRegistry.getTool.mockReturnValue({
      name: 'loop_tool',
      kind: 'read',
      module: AiRelatedModule.GENERAL,
      allowedRoles: [FamilyRole.FAMILY_MANAGER],
    });
    toolRegistry.executeReadTool.mockResolvedValue({ ok: true, content: '{}' });
    openAiClient.chat.mockResolvedValue(toolCallCompletion('loop_tool', {}));

    const result = await send();

    // 5 round tool + 1 round chốt; round chốt bị ép 'none'.
    expect(openAiClient.chat).toHaveBeenCalledTimes(6);
    expect(openAiClient.chat.mock.calls[5][2]).toBe('none');
    expect(result.aiMessage).toBeDefined();
  });

  it('OpenAI lỗi → throw 502 nhưng message USER đã được lưu', async () => {
    openAiClient.chat.mockRejectedValue(
      new BadGatewayException('Trợ lý AI hiện không phản hồi'),
    );

    await expect(send()).rejects.toThrow(BadGatewayException);

    expect(prisma.aIMessage.create).toHaveBeenCalledTimes(1);
    expect(prisma.aIMessage.create.mock.calls[0][0].data.senderType).toBe(
      AiSenderType.USER,
    );
  });
});
