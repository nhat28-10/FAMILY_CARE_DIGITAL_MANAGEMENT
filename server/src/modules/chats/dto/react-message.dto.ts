import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReactMessageDto {
  @ApiProperty({ description: 'Emoji cảm xúc', example: '❤️' })
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  emoji!: string;
}
