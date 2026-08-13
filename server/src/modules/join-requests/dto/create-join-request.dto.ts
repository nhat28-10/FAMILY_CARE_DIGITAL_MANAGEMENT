import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateJoinRequestDto {
  @ApiPropertyOptional({
    example: 'Con là út của bố',
    description: 'Lời nhắn gửi kèm cho quản lý gia đình',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
