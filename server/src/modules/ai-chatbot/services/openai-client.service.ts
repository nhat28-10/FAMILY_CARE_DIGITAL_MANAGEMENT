import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
} from 'openai/resources/chat/completions';

export interface OpenAiChatbotConfig {
  apiKey: string;
  model: string;
  maxToolRounds: number;
  timeoutMs: number;
  maxHistoryMessages: number;
  actionExpiresMinutes: number;
}

/**
 * Wrapper mỏng quanh SDK openai: đọc config, timeout, map lỗi sang
 * HttpException tiếng Việt. Không chứa logic hội thoại.
 */
@Injectable()
export class OpenAiClientService {
  private readonly logger = new Logger(OpenAiClientService.name);
  readonly config: OpenAiChatbotConfig;
  private readonly client: OpenAI | null;

  constructor(configService: ConfigService) {
    this.config = configService.get<OpenAiChatbotConfig>('openai')!;
    this.client = this.config.apiKey
      ? new OpenAI({
          apiKey: this.config.apiKey,
          timeout: this.config.timeoutMs,
          maxRetries: 1,
        })
      : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[],
    toolChoice?: ChatCompletionToolChoiceOption,
  ): Promise<ChatCompletion> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Trợ lý AI chưa được cấu hình trên hệ thống',
      );
    }
    try {
      return await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        ...(tools && tools.length > 0 ? { tools } : {}),
        ...(toolChoice ? { tool_choice: toolChoice } : {}),
      });
    } catch (error) {
      const status =
        error instanceof OpenAI.APIError ? error.status : undefined;
      this.logger.error(
        `OpenAI chat.completions lỗi (status=${status ?? 'network'}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (status === 429) {
        throw new BadGatewayException(
          'Trợ lý AI đang quá tải, vui lòng thử lại sau ít phút',
        );
      }
      throw new BadGatewayException(
        'Trợ lý AI hiện không phản hồi, vui lòng thử lại sau',
      );
    }
  }
}
