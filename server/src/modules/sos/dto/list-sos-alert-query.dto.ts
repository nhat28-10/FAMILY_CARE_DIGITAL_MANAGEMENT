import { ApiPropertyOptional } from '@nestjs/swagger';
import { SosAlertStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListSosAlertQueryDto {
  @ApiPropertyOptional({
    enum: SosAlertStatus,
    description: 'Lọc theo trạng thái (vd RESOLVED để xem lịch sử)',
  })
  @IsOptional()
  @IsEnum(SosAlertStatus)
  status?: SosAlertStatus;
}
