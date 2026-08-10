import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class InitiateCallDto {
  @ApiProperty({ description: 'id hội thoại muốn gọi', format: 'uuid' })
  @IsUUID('4')
  conversationId!: string;
}
