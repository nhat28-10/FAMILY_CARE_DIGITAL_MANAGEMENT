import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class UpdateTaskAssignmentDto {
  @ApiPropertyOptional({
    example: '2026-06-20T08:00:00.000Z',
    description: 'Thoi gian du kien bat dau lam cong viec',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Thoi gian bat dau phai la ngay hop le' })
  startAt?: string;

  @ApiPropertyOptional({
    example: '2026-06-20T10:00:00.000Z',
    description: 'Thoi gian du kien ket thuc hoac han hoan thanh cong viec',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Thoi gian ket thuc phai la ngay hop le' })
  dueAt?: string;
}
