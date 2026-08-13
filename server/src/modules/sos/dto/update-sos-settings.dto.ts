import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/** Cấu hình SOS của gia đình — mọi field optional, chỉ cập nhật field gửi lên. */
export class UpdateSosSettingsDto {
  @ApiPropertyOptional({ description: 'Bật/tắt toàn bộ tính năng SOS' })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'true = báo mọi thành viên; false = chỉ báo quản lý/phó',
  })
  @IsOptional()
  @IsBoolean()
  notifyAllMembers?: boolean;

  @ApiPropertyOptional({
    description: 'Tự tạo cảnh báo SOS khi thiết bị phát hiện té ngã',
  })
  @IsOptional()
  @IsBoolean()
  autoCreateAlertFromFall?: boolean;

  @ApiPropertyOptional({
    description: 'Bắt buộc có vị trí ban đầu khi kích hoạt SOS từ app',
  })
  @IsOptional()
  @IsBoolean()
  locationRequired?: boolean;
}
