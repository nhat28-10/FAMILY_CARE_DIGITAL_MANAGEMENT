import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAiConversationDto {
  @ApiPropertyOptional({
    example: 'Hỏi về chi tiêu tháng 7',
    maxLength: 120,
    description:
      'Tiêu đề cuộc trò chuyện. Bỏ trống sẽ tự đặt theo tin nhắn đầu.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}
