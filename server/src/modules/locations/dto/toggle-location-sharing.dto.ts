import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** Bật/tắt chia sẻ vị trí của chính thành viên đang đăng nhập. */
export class ToggleLocationSharingDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isSharing!: boolean;
}
