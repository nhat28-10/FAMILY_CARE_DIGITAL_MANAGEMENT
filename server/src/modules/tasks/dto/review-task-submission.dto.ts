import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum ReviewTaskSubmissionDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

const trimString = ({ value }: TransformFnParams): unknown => {
  const candidate: unknown = value;
  return typeof candidate === 'string' ? candidate.trim() : candidate;
};

export class ReviewTaskSubmissionDto {
  @ApiProperty({
    enum: ReviewTaskSubmissionDecision,
    description: 'Quyết định duyệt minh chứng hoàn thành công việc',
  })
  @IsEnum(ReviewTaskSubmissionDecision, {
    message: 'Quyết định duyệt không hợp lệ',
  })
  decision!: ReviewTaskSubmissionDecision;

  @ApiPropertyOptional({
    example: 'Hoàn thành tốt',
    description: 'Ghi chú đánh giá minh chứng hoàn thành công việc',
  })
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: 'Ghi chú đánh giá phải là chuỗi' })
  @MaxLength(1000, {
    message: 'Ghi chú đánh giá không được vượt quá 1000 ký tự',
  })
  reviewNote?: string;
}
