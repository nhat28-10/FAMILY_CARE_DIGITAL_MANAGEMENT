import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

const trimString = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateRewardDisputeDto {
  @ApiProperty({
    example: 'Em chưa nhận được tiền thưởng sau khi quản lý đánh dấu đã trả.',
    minLength: 5,
    maxLength: 1000,
    description: 'Lý do báo chưa nhận được thưởng',
  })
  @Transform(trimString)
  @IsString({ message: 'Lý do tranh chấp là bắt buộc' })
  @IsNotEmpty({ message: 'Lý do tranh chấp là bắt buộc' })
  @MinLength(5, {
    message: 'Lý do tranh chấp phải có ít nhất 5 ký tự',
  })
  @MaxLength(1000, {
    message: 'Lý do tranh chấp không được vượt quá 1000 ký tự',
  })
  reason!: string;
}
