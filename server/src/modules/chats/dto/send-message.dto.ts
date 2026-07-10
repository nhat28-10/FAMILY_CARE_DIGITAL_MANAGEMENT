import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** File đã upload qua `POST .../messages/upload` — gắn vào tin nhắn khi gửi. */
export class MessageAttachmentInputDto {
  @ApiProperty({ description: 'MIME type của file', example: 'image/jpeg' })
  @IsString()
  @MaxLength(120)
  fileType!: string;

  @ApiProperty({
    description: 'URL trả về từ endpoint upload',
    example: 'https://pub-xxx.r2.dev/chat-attachments/<familyId>/<uuid>.jpg',
  })
  @IsString()
  @MaxLength(1000)
  fileUrl!: string;

  @ApiPropertyOptional({
    description: 'Tên file gốc',
    example: 'anh-gia-dinh.jpg',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @ApiPropertyOptional({ description: 'Dung lượng (bytes)', example: 123456 })
  @IsOptional()
  @IsInt()
  @Min(0)
  fileSize?: number;
}

export class SendMessageDto {
  @ApiPropertyOptional({
    enum: MessageType,
    description:
      'Mặc định tự suy ra: có đính kèm ảnh → IMAGE, file → FILE, còn lại TEXT',
  })
  @IsOptional()
  @IsEnum(MessageType)
  messageType?: MessageType;

  @ApiPropertyOptional({
    description: 'Nội dung tin nhắn (bắt buộc nếu không có đính kèm)',
    example: 'Tối nay cả nhà ăn gì?',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

  @ApiPropertyOptional({
    description: 'messageId của tin được trả lời (reply/quote)',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4')
  replyToMessageId?: string;

  @ApiPropertyOptional({
    description: 'File đính kèm (đã upload trước qua endpoint upload)',
    type: [MessageAttachmentInputDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => MessageAttachmentInputDto)
  attachments?: MessageAttachmentInputDto[];
}
