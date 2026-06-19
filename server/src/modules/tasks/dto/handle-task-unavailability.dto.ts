import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export enum HandleTaskUnavailabilityAction {
  REASSIGN = 'REASSIGN',
  CANCEL_ASSIGNMENT = 'CANCEL_ASSIGNMENT',
  MARK_HANDLED = 'MARK_HANDLED',
}

const trimString = ({ value }: TransformFnParams): unknown => {
  const candidate: unknown = value;
  return typeof candidate === 'string' ? candidate.trim() : candidate;
};

export class HandleTaskUnavailabilityDto {
  @ApiProperty({
    enum: HandleTaskUnavailabilityAction,
    description: 'Cách xử lý báo cáo không thể làm công việc',
  })
  @IsEnum(HandleTaskUnavailabilityAction, {
    message: 'Hành động xử lý báo cáo không hợp lệ',
  })
  action!: HandleTaskUnavailabilityAction;

  @ApiPropertyOptional({
    example: 'd6a2a0a5-2b8c-4e44-86ad-a2e18689ad56',
    description: 'ID thành viên mới được giao công việc khi chọn REASSIGN',
  })
  @IsOptional()
  @IsNotEmpty({ message: 'Thành viên được giao mới không được để trống' })
  @IsUUID('4', {
    message: 'Thành viên được giao mới phải là UUID hợp lệ',
  })
  newAssignedToMemberId?: string;

  @ApiPropertyOptional({
    example: '2026-06-20T08:00:00.000Z',
    description: 'Thời gian bắt đầu mới khi giao lại công việc',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Thời gian bắt đầu phải là ngày hợp lệ' })
  startAt?: string;

  @ApiPropertyOptional({
    example: '2026-06-20T18:00:00.000Z',
    description: 'Thời hạn hoàn thành mới khi giao lại công việc',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Thời hạn hoàn thành phải là ngày hợp lệ' })
  dueAt?: string;

  @ApiPropertyOptional({
    example: 'Đã trao đổi với gia đình và xử lý ngoài hệ thống',
    description: 'Ghi chú xử lý, không lưu trong MVP Phase 5',
  })
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: 'Ghi chú xử lý phải là chuỗi' })
  @MaxLength(1000, {
    message: 'Ghi chú xử lý không được vượt quá 1000 ký tự',
  })
  note?: string;
}
