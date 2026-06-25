import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CreateCheckoutDto {
  @ApiProperty({
    example: 'PLUS',
    description: 'Mã gói muốn nâng cấp (gói trả phí, không phải FREE)',
  })
  @IsString()
  @MaxLength(50)
  planCode: string;
}
