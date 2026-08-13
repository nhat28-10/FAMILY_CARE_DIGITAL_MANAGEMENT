import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateFinanceJarDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  financeModelId!: string;

  @ApiProperty({ example: 'Chi tiêu thiết yếu' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'NECESSITIES' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  jarCode!: string;

  @ApiProperty({ example: 55, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  allocationPercentage!: number;

  @ApiPropertyOptional({ example: 'Các khoản chi thiết yếu của gia đình' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
