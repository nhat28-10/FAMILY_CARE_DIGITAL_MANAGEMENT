import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveSosAlertDto {
  @ApiPropertyOptional({ example: 'Đã xác nhận thành viên an toàn' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNote?: string;

  @ApiPropertyOptional({
    description:
      'true = đóng với trạng thái FALSE_ALARM (báo động giả) thay vì RESOLVED. Chỉ áp dụng cho resolve, cancel bỏ qua field này.',
  })
  @IsOptional()
  @IsBoolean()
  isFalseAlarm?: boolean;
}
