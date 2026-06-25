import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewGoalContributionPlanDto {
  @ApiPropertyOptional({ example: 'Da doi soat voi giao dich ngan hang' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
