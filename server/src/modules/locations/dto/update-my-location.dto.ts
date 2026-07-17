import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

/** Thiết bị đẩy vị trí hiện tại của chính thành viên đang đăng nhập. */
export class UpdateMyLocationDto {
  @ApiProperty({ example: 10.77689, minimum: -90, maximum: 90 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: 106.70091, minimum: -180, maximum: 180 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({
    example: 18,
    minimum: 0,
    description: 'Độ chính xác GPS (mét)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  accuracy?: number;
}
