import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateFinancialGoalDto {
  @ApiPropertyOptional({ example: 'Quỹ dự phòng khẩn cấp đã cập nhật' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  goalName?: string;

  @ApiPropertyOptional({ example: 35000000, minimum: 0.01 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  targetAmount?: number;

  @ApiPropertyOptional({ example: '2027-01-31', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsDateString()
  deadline?: string | null;

  @ApiPropertyOptional({ example: 3000000, minimum: 0, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyContributionTarget?: number | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsUUID()
  relatedJarId?: string | null;
}
