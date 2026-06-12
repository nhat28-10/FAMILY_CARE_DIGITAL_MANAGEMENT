import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateSpendingSupportRequestDto {
  @ApiProperty({ example: 250000, description: 'Số tiền hỗ trợ, lớn hơn 0' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ example: 'Hỗ trợ mua sách giáo khoa' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  purpose!: string;
}
