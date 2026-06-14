import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EssentialType, FinanceCategoryType } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateFinanceCategoryDto {
  @ApiProperty({ example: 'Groceries' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: FinanceCategoryType })
  @IsEnum(FinanceCategoryType)
  categoryType!: FinanceCategoryType;

  @ApiPropertyOptional({
    enum: EssentialType,
    default: EssentialType.NEUTRAL,
  })
  @IsOptional()
  @IsEnum(EssentialType)
  essentialType?: EssentialType;
}
