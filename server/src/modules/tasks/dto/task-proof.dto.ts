import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskProofType } from '@prisma/client';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const trimString = ({ value }: TransformFnParams): unknown => {
  const candidate: unknown = value;
  return typeof candidate === 'string' ? candidate.trim() : candidate;
};

const PROOF_TYPES_REQUIRING_FILE: TaskProofType[] = [
  TaskProofType.IMAGE,
  TaskProofType.VIDEO,
  TaskProofType.FILE,
];

const requiresFileUrl = (proof: TaskProofDto): boolean =>
  PROOF_TYPES_REQUIRING_FILE.includes(proof.proofType);

export class TaskProofDto {
  @ApiProperty({
    enum: TaskProofType,
    description: 'Loại minh chứng hoàn thành công việc',
  })
  @IsEnum(TaskProofType, { message: 'Loại minh chứng không hợp lệ' })
  proofType!: TaskProofType;

  @ApiPropertyOptional({
    example: '/uploads/task-proofs/family-id/proof.jpg',
    description:
      'Đường dẫn file minh chứng nhận được từ API tải file minh chứng lên hệ thống',
  })
  @Transform(trimString)
  @ValidateIf(requiresFileUrl)
  @IsString({ message: 'Đường dẫn file minh chứng phải là chuỗi' })
  @IsNotEmpty({ message: 'Đường dẫn file minh chứng không được để trống' })
  @MaxLength(1000, {
    message: 'Đường dẫn file minh chứng không được vượt quá 1000 ký tự',
  })
  fileUrl?: string;

  @ApiPropertyOptional({
    example: '/uploads/task-proofs/family-id/proof-thumb.jpg',
    description:
      'Đường dẫn ảnh đại diện của minh chứng nếu hệ thống upload trả về',
  })
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: 'Đường dẫn ảnh đại diện minh chứng phải là chuỗi' })
  @MaxLength(1000, {
    message: 'Đường dẫn ảnh đại diện minh chứng không được vượt quá 1000 ký tự',
  })
  thumbnailUrl?: string;

  @ApiPropertyOptional({
    example: 'Con đã rửa chén xong',
    description: 'Ghi chú minh chứng',
  })
  @Transform(trimString)
  @ValidateIf((proof: TaskProofDto) => proof.proofType === TaskProofType.NOTE)
  @IsString({ message: 'Ghi chú minh chứng phải là chuỗi' })
  @IsNotEmpty({ message: 'Nội dung ghi chú minh chứng không được để trống' })
  @MaxLength(1000, {
    message: 'Ghi chú minh chứng không được vượt quá 1000 ký tự',
  })
  note?: string;
}
