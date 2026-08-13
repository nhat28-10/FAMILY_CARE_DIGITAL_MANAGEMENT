import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreateTaskAssignmentDto {
  @ApiProperty({
    example: 'd6a2a0a5-2b8c-4e44-86ad-a2e18689ad56',
    description: 'ID thành viên trong gia đình được giao công việc',
  })
  @IsNotEmpty({ message: 'Thành viên được giao không được để trống' })
  @IsUUID('4', { message: 'Thành viên được giao phải là UUID hợp lệ' })
  assignedToMemberId!: string;

  @ApiPropertyOptional({
    example: '2026-06-20T08:00:00.000Z',
    description: 'Thời gian dự kiến bắt đầu làm công việc',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Thời gian bắt đầu phải là ngày hợp lệ' })
  startAt?: string;

  @ApiPropertyOptional({
    example: '2026-06-20T10:00:00.000Z',
    description: 'Thời gian dự kiến kết thúc hoặc hạn hoàn thành công việc',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Thời gian kết thúc phải là ngày hợp lệ' })
  dueAt?: string;
}
