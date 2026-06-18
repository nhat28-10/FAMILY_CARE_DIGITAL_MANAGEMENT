import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SosResponseType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSosResponseDto {
  @ApiProperty({
    enum: SosResponseType,
    description:
      'Chỉ chấp nhận VIEWED / CONFIRM_SAFE / NEED_HELP từ thành viên',
  })
  @IsEnum(SosResponseType)
  responseType!: SosResponseType;

  @ApiPropertyOptional({ example: 'Tôi đang trên đường tới' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
