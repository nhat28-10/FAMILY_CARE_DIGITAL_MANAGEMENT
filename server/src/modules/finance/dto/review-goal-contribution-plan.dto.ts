import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewGoalContributionPlanDto {
  @ApiPropertyOptional({ example: 'Đã đối soát với giao dịch ngân hàng' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
