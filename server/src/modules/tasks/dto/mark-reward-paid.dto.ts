import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RewardExternalMethod } from '@prisma/client';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

const trimString = ({ value }: TransformFnParams): unknown => {
  const candidate: unknown = value;
  return typeof candidate === 'string' ? candidate.trim() : candidate;
};

export class MarkRewardPaidDto {
  @ApiProperty({
    enum: RewardExternalMethod,
    description: 'Phương thức trả thưởng ngoài hệ thống',
  })
  @IsEnum(RewardExternalMethod, {
    message: 'Phương thức trả thưởng ngoài hệ thống không hợp lệ',
  })
  externalMethod!: RewardExternalMethod;

  @ApiPropertyOptional({
    example: 'Đã chuyển khoản qua ngân hàng ngoài hệ thống',
    description: 'Ghi chú trả thưởng ngoài hệ thống',
  })
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: 'Ghi chú trả thưởng phải là chuỗi' })
  @MaxLength(1000, {
    message: 'Ghi chú trả thưởng không được vượt quá 1000 ký tự',
  })
  externalNote?: string;
}
