import { Injectable } from '@nestjs/common';
import { AiRelatedModule, FamilyRole } from '@prisma/client';

import { AiDailyBriefService } from '../services/ai-daily-brief.service';
import type { AiToolContext } from '../types/ai-chatbot.types';
import type { AiToolDefinition, AiToolProvider } from './tool.types';

@Injectable()
export class DailyBriefAiTools implements AiToolProvider {
  constructor(private readonly dailyBriefService: AiDailyBriefService) {}

  getTools(): AiToolDefinition[] {
    return [
      {
        name: 'get_daily_brief',
        description:
          'Lấy tổng quan chủ động hôm nay cho gia đình: việc cần chú ý, lịch sắp tới, cảnh báo ngân sách, mục tiêu tài chính và gợi ý prompt tiếp theo. Dùng khi người dùng hỏi hôm nay có gì, tổng quan, việc quan trọng, nhắc tôi, daily brief.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        module: AiRelatedModule.GENERAL,
        kind: 'read',
        allowedRoles: [
          FamilyRole.FAMILY_MANAGER,
          FamilyRole.DEPUTY_MEMBER,
          FamilyRole.FAMILY_MEMBER,
        ],
        execute: (_args: Record<string, unknown>, ctx: AiToolContext) =>
          this.dailyBriefService.getDailyBrief(ctx),
      },
    ];
  }
}
