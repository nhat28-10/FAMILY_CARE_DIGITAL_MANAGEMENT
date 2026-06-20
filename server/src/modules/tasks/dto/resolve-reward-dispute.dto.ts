import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum ResolveRewardDisputeAction {
  ACCEPT_DISPUTE = 'ACCEPT_DISPUTE',
  REJECT_DISPUTE = 'REJECT_DISPUTE',
}

export class ResolveRewardDisputeDto {
  @ApiProperty({
    enum: ResolveRewardDisputeAction,
    description: 'Hành động xử lý tranh chấp thưởng',
  })
  @IsEnum(ResolveRewardDisputeAction, {
    message: 'Hành động xử lý tranh chấp không hợp lệ',
  })
  action!: ResolveRewardDisputeAction;
}
