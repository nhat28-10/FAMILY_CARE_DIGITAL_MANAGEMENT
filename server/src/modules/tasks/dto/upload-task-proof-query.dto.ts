import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskProofType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class UploadTaskProofQueryDto {
  @ApiPropertyOptional({
    enum: [TaskProofType.IMAGE, TaskProofType.VIDEO, TaskProofType.FILE],
    description:
      'Loại file minh chứng muốn upload; nếu không gửi, hệ thống tự xác định theo MIME type',
  })
  @IsOptional()
  @IsEnum(TaskProofType, { message: 'Loại minh chứng không hợp lệ' })
  proofType?: TaskProofType;
}
