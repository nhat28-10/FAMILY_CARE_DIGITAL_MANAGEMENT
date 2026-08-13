import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  EssentialType,
  FinanceCategoryStatus,
  FinanceCategoryType,
} from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateFinanceCategoryDto {
  @ApiPropertyOptional({ example: 'Groceries' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ enum: FinanceCategoryType })
  @IsOptional()
  @IsEnum(FinanceCategoryType)
  categoryType?: FinanceCategoryType;

  @ApiPropertyOptional({ enum: EssentialType })
  @IsOptional()
  @IsEnum(EssentialType)
  essentialType?: EssentialType;

  @ApiPropertyOptional({ enum: FinanceCategoryStatus })
  @IsOptional()
  @IsEnum(FinanceCategoryStatus)
  status?: FinanceCategoryStatus;
}
