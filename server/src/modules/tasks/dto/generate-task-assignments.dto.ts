import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';

const trimString = ({ value }: TransformFnParams): unknown => {
  const candidate: unknown = value;
  return typeof candidate === 'string' ? candidate.trim() : candidate;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class GenerateTaskAssignmentsDto {
  @ApiProperty({
    example: 'd6a2a0a5-2b8c-4e44-86ad-a2e18689ad56',
    description: 'ID thành viên trong gia đình được giao công việc',
  })
  @IsNotEmpty({ message: 'Thành viên được giao không được để trống' })
  @IsUUID('4', { message: 'Thành viên được giao phải là UUID hợp lệ' })
  assignedToMemberId!: string;

  @ApiProperty({
    example: '2026-06-18',
    description: 'Ngày bắt đầu khoảng sinh phân công',
  })
  @IsDateString({}, { message: 'Ngày bắt đầu phải là ngày hợp lệ' })
  fromDate!: string;

  @ApiProperty({
    example: '2026-06-30',
    description: 'Ngày kết thúc khoảng sinh phân công',
  })
  @IsDateString({}, { message: 'Ngày kết thúc phải là ngày hợp lệ' })
  toDate!: string;

  @ApiPropertyOptional({
    example: '08:00',
    description: 'Giờ bắt đầu theo định dạng HH:mm',
  })
  @Transform(trimString)
  @IsOptional()
  @Matches(TIME_PATTERN, {
    message: 'Giờ bắt đầu phải đúng định dạng HH:mm',
  })
  startTime?: string;

  @ApiPropertyOptional({
    example: '18:00',
    description: 'Giờ hết hạn theo định dạng HH:mm',
  })
  @Transform(trimString)
  @IsOptional()
  @Matches(TIME_PATTERN, {
    message: 'Giờ hết hạn phải đúng định dạng HH:mm',
  })
  dueTime?: string;
}
