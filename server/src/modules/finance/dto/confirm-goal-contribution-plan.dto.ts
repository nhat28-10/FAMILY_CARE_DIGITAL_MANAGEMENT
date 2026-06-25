import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ConfirmGoalContributionPlanMemberDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  memberId!: string;

  @ApiProperty({ example: 2000000, minimum: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  plannedAmount!: number;
}

export class ConfirmGoalContributionPlanDto {
  @ApiProperty({ example: 6, minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth!: number;

  @ApiProperty({ example: 2026, minimum: 1900, maximum: 9999 })
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(9999)
  periodYear!: number;

  @ApiProperty({ example: '2026-06-30' })
  @IsDateString()
  dueDate!: string;

  @ApiProperty({ type: [ConfirmGoalContributionPlanMemberDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConfirmGoalContributionPlanMemberDto)
  members!: ConfirmGoalContributionPlanMemberDto[];
}
