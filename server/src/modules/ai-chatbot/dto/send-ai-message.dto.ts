import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendAiMessageDto {
  @ApiProperty({
    example: 'Tháng này nhà mình tiêu hết bao nhiêu?',
    maxLength: 2000,
    description: 'Nội dung tin nhắn gửi cho trợ lý AI',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}
