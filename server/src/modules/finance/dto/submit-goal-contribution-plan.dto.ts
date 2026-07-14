import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class SubmitGoalContributionPlanDto {
  @ApiProperty({ example: 1500000, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ example: 'Đã chuyển khoản cho quỹ' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
