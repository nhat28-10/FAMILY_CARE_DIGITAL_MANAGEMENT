import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';

import { PushSosLocationDto } from './push-sos-location.dto';

export class PushSosLocationBatchDto {
  @ApiProperty({
    type: [PushSosLocationDto],
    description:
      'Danh sách điểm vị trí gửi theo lô (thiết bị buffer khi offline rồi flush)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PushSosLocationDto)
  points!: PushSosLocationDto[];
}
