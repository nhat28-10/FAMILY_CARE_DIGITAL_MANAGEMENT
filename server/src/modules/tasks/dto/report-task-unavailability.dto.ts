import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

const trimString = ({ value }: TransformFnParams): unknown => {
  const candidate: unknown = value;
  return typeof candidate === 'string' ? candidate.trim() : candidate;
};

export class ReportTaskUnavailabilityDto {
  @ApiProperty({
    example: 'Con bị ốm nên không thể hoàn thành công việc này',
    description: 'Lý do không thể làm công việc được giao',
  })
  @Transform(trimString)
  @IsString({ message: 'Lý do không thể làm task phải là chuỗi' })
  @IsNotEmpty({ message: 'Lý do không thể làm task là bắt buộc' })
  @MinLength(5, { message: 'Lý do phải có ít nhất 5 ký tự' })
  @MaxLength(1000, {
    message: 'Lý do không được vượt quá 1000 ký tự',
  })
  reason!: string;
}
