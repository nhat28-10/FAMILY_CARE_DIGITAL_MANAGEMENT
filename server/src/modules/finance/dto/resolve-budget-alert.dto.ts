import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveBudgetAlertDto {
  @ApiPropertyOptional({ example: 'Đã điều chỉnh kế hoạch chi tiêu' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
