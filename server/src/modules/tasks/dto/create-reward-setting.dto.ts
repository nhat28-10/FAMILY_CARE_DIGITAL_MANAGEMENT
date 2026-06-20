import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RewardType } from '@prisma/client';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const trimString = ({ value }: TransformFnParams): unknown => {
  const candidate: unknown = value;
  return typeof candidate === 'string' ? candidate.trim() : candidate;
};

export class CreateRewardSettingDto {
  @ApiProperty({
    enum: RewardType,
    description: 'Loại thưởng của công việc',
  })
  @IsEnum(RewardType, { message: 'Loại thưởng không hợp lệ' })
  rewardType!: RewardType;

  @ApiPropertyOptional({
    example: 50000,
    minimum: 0,
    description: 'Số tiền hoặc điểm thưởng',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Số tiền/thưởng không hợp lệ' })
  @Min(0, { message: 'Số tiền/thưởng phải lớn hơn hoặc bằng 0' })
  rewardAmount?: number;

  @ApiPropertyOptional({
    example: 'Một phần quà nhỏ do gia đình tự trao',
    description: 'Mô tả thưởng',
  })
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: 'Mô tả thưởng phải là chuỗi' })
  @MaxLength(1000, {
    message: 'Mô tả thưởng không được vượt quá 1000 ký tự',
  })
  rewardDescription?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Tự tạo ghi nhận thưởng khi bài nộp được duyệt',
  })
  @IsOptional()
  @IsBoolean({ message: 'Tự tạo ghi nhận thưởng phải là boolean' })
  autoCreateSettlement?: boolean;
}
