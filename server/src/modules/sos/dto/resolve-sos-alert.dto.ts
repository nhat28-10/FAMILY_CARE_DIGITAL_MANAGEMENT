import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveSosAlertDto {
  @ApiPropertyOptional({ example: 'Đã xác nhận thành viên an toàn' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNote?: string;
}
