import { Module } from '@nestjs/common';

import { CalendarModule } from '../calendar/calendar.module';
import { FamilyMembersModule } from '../family-members/family-members.module';
import { FinanceModule } from '../finance/finance.module';
import { LocationsModule } from '../locations/locations.module';
import { SosModule } from '../sos/sos.module';
import { TasksModule } from '../tasks/tasks.module';
import { AiChatbotController } from './controllers/ai-chatbot.controller';
import { AiActionsService } from './services/ai-actions.service';
import { AiChatService } from './services/ai-chat.service';
import { AiConversationsService } from './services/ai-conversations.service';
import { AiDailyBriefService } from './services/ai-daily-brief.service';
import { OpenAiClientService } from './services/openai-client.service';
import { CalendarAiTools } from './tools/calendar.tools';
import { DailyBriefAiTools } from './tools/daily-brief.tools';
import { FinanceAiTools } from './tools/finance.tools';
import { SafetyAiTools } from './tools/safety.tools';
import { TasksAiTools } from './tools/tasks.tools';
import { ToolRegistryService } from './tools/tool-registry.service';

/**
 * Trợ lý AI của gia đình (OpenAI function calling). Tool chỉ gọi lại service
 * của các module domain — không truy vấn Prisma vượt quyền người hỏi.
 */
@Module({
  imports: [
    FamilyMembersModule,
    CalendarModule,
    FinanceModule,
    TasksModule,
    SosModule,
    LocationsModule,
  ],
  controllers: [AiChatbotController],
  providers: [
    AiConversationsService,
    AiDailyBriefService,
    AiChatService,
    AiActionsService,
    OpenAiClientService,
    ToolRegistryService,
    DailyBriefAiTools,
    CalendarAiTools,
    FinanceAiTools,
    TasksAiTools,
    SafetyAiTools,
  ],
})
export class AiChatbotModule {}
