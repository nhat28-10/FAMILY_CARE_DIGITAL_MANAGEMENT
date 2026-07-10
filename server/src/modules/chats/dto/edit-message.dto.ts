import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class EditMessageDto {
  @ApiProperty({ description: 'Nội dung mới', example: 'Tối nay ăn lẩu nhé!' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}
