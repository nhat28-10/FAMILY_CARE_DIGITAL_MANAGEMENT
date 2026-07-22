import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsUUID } from 'class-validator';

/**
 * Trao quyền trưởng nhóm cho một thành viên khác. `confirm` phải là true
 * để tránh trao nhầm (UI hiển thị dialog cảnh báo trước khi gửi).
 */
export class TransferOwnershipDto {
  @ApiProperty({ description: 'userId của thành viên nhận quyền trưởng nhóm' })
  @IsUUID()
  targetUserId: string;

  @ApiProperty({ description: 'Phải là true để xác nhận trao quyền' })
  @IsBoolean()
  @Equals(true)
  confirm: boolean;
}
