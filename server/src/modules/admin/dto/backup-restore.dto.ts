import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export const BACKUP_TARGETS = [
  'DATABASE',
  'SYSTEM_CONFIG',
  'FULL_SYSTEM',
] as const;
export type BackupTarget = (typeof BACKUP_TARGETS)[number];

export const BACKUP_STATUSES = [
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'FAILED',
] as const;
export type BackupStatus = (typeof BACKUP_STATUSES)[number];

export const RESTORE_STATUSES = [
  'PENDING_APPROVAL',
  'APPROVED',
  'READY_TO_RESTORE',
  'FAILED',
] as const;
export type RestoreStatus = (typeof RESTORE_STATUSES)[number];

export class CreateBackupDto {
  @ApiProperty({ enum: BACKUP_TARGETS, example: 'DATABASE' })
  @IsIn(BACKUP_TARGETS)
  target!: BackupTarget;

  @ApiPropertyOptional({
    example: 'Backup thủ công trước khi cập nhật hệ thống',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListBackupsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BACKUP_STATUSES })
  @IsOptional()
  @IsIn(BACKUP_STATUSES)
  status?: BackupStatus;

  @ApiPropertyOptional({ enum: BACKUP_TARGETS })
  @IsOptional()
  @IsIn(BACKUP_TARGETS)
  target?: BackupTarget;
}

export class CreateRestoreDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  backupId!: string;

  @ApiProperty({ enum: BACKUP_TARGETS, example: 'DATABASE' })
  @IsIn(BACKUP_TARGETS)
  target!: BackupTarget;

  @ApiPropertyOptional({
    example: 'Yêu cầu khôi phục dữ liệu từ backup trước khi cập nhật hệ thống',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListRestoresQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RESTORE_STATUSES })
  @IsOptional()
  @IsIn(RESTORE_STATUSES)
  status?: RestoreStatus;

  @ApiPropertyOptional({ enum: BACKUP_TARGETS })
  @IsOptional()
  @IsIn(BACKUP_TARGETS)
  target?: BackupTarget;
}

export class ConfirmRestoreDto {
  @ApiProperty({ example: 'CONFIRM_RESTORE' })
  @IsString()
  @MaxLength(50)
  confirmationText!: string;

  @ApiPropertyOptional({
    example: 'Xác nhận yêu cầu restore theo quy trình vận hành',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
