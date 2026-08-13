import { ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateConversationDto {
  @ApiPropertyOptional({ description: 'Tên nhóm mới', example: 'Nhà mình' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  conversationName?: string;

  @ApiPropertyOptional({
    enum: ConversationStatus,
    description: 'ARCHIVED = lưu trữ (khóa gửi tin); ACTIVE = mở lại',
  })
  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;
}
