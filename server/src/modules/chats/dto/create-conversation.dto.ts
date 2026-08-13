import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationType } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({
    enum: ConversationType,
    description: 'GROUP = nhóm tùy chỉnh; PRIVATE = chat 1-1',
  })
  @IsEnum(ConversationType)
  conversationType!: ConversationType;

  @ApiPropertyOptional({
    description: 'Tên nhóm (bắt buộc khi conversationType = GROUP)',
    example: 'Hội bàn việc Tết',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  conversationName?: string;

  @ApiPropertyOptional({
    description: 'Danh sách memberId mời vào nhóm (GROUP; người tạo tự vào)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  memberIds?: string[];

  @ApiPropertyOptional({
    description:
      'memberId muốn nhắn tin (bắt buộc khi conversationType = PRIVATE)',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4')
  targetMemberId?: string;
}
