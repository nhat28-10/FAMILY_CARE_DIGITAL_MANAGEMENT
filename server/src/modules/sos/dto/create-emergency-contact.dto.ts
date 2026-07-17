import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateEmergencyContactDto {
  @ApiProperty({ example: 'Bác sĩ Nguyễn Văn B' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  contactName!: string;

  @ApiProperty({ example: '+84901234567' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phoneNumber!: string;

  @ApiPropertyOptional({ example: 'Bác sĩ gia đình' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  relationshipNote?: string;

  @ApiPropertyOptional({
    example: 1,
    minimum: 1,
    description: 'Thứ tự gọi ưu tiên; bỏ trống = xếp cuối danh sách',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  priorityOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
