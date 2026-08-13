import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateFinanceJarDto {
  @ApiPropertyOptional({ example: 'Chi tiêu thiết yếu' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'NECESSITIES' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  jarCode?: string;

  @ApiPropertyOptional({ example: 55, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  allocationPercentage?: number;

  @ApiPropertyOptional({
    example: 'Các khoản chi thiết yếu của gia đình',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
