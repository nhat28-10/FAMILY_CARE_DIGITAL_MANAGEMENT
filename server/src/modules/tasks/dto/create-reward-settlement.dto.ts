import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateRewardSettlementDto {
  @ApiProperty({
    example: '5d8c83f7-c5c8-4d6a-8d65-d9b49a8c9c31',
    description: 'ID bài nộp công việc đã được duyệt',
  })
  @IsNotEmpty({ message: 'Bài nộp công việc không được để trống' })
  @IsUUID('4', { message: 'Bài nộp công việc phải là UUID hợp lệ' })
  taskSubmissionId!: string;
}
