import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { TaskProofDto } from './task-proof.dto';

export class CreateTaskSubmissionDto {
  @ApiPropertyOptional({
    example: 'Con đã hoàn thành công việc',
    description: 'Ghi chú khi nộp minh chứng hoàn thành công việc',
  })
  @IsOptional()
  @IsString({ message: 'Ghi chú nộp minh chứng phải là chuỗi' })
  @MaxLength(1000, {
    message: 'Ghi chú nộp minh chứng không được vượt quá 1000 ký tự',
  })
  submissionNote?: string;

  @ApiProperty({
    type: [TaskProofDto],
    description: 'Danh sách minh chứng hoàn thành công việc',
  })
  @IsArray({ message: 'Danh sách minh chứng phải là mảng' })
  @ArrayMinSize(1, {
    message: 'Danh sách minh chứng không được để trống',
  })
  @ValidateNested({ each: true })
  @Type(() => TaskProofDto)
  proofs!: TaskProofDto[];
}
