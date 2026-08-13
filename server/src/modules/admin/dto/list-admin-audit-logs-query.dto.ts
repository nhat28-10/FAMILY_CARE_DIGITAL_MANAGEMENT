import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export const ADMIN_AUDIT_ACTIONS = [
  'ADMIN_USER_LOCK',
  'ADMIN_USER_UNLOCK',
  'ADMIN_USER_UPDATE',
  'ADMIN_USER_DELETE',
  'ADMIN_SUBSCRIPTION_MANUAL_RENEW',
  'ADMIN_SUBSCRIPTION_STATUS_UPDATE',
  'ADMIN_SUBSCRIPTION_STRIPE_SYNC',
  'ADMIN_PROVISIONING_RETRY',
  'ADMIN_CONTAINER_STATS_VIEW',
  'ADMIN_CONTAINER_LOGS_VIEW',
  'ADMIN_BACKUP_CREATE',
  'ADMIN_RESTORE_REQUEST_CREATE',
  'ADMIN_RESTORE_CONFIRM',
] as const;
export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

export const ADMIN_AUDIT_TARGET_TYPES = [
  'USER',
  'FAMILY',
  'SUBSCRIPTION',
  'PROVISIONING',
  'CONTAINER',
  'BACKUP',
  'RESTORE',
  'SYSTEM',
] as const;
export type AdminAuditTargetType = (typeof ADMIN_AUDIT_TARGET_TYPES)[number];

export const ADMIN_AUDIT_RESULTS = ['SUCCESS', 'FAILED'] as const;
export type AdminAuditResult = (typeof ADMIN_AUDIT_RESULTS)[number];

export class ListAdminAuditLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  adminUserId?: string;

  @ApiPropertyOptional({ enum: ADMIN_AUDIT_ACTIONS })
  @IsOptional()
  @IsIn(ADMIN_AUDIT_ACTIONS)
  action?: AdminAuditAction;

  @ApiPropertyOptional({ enum: ADMIN_AUDIT_TARGET_TYPES })
  @IsOptional()
  @IsIn(ADMIN_AUDIT_TARGET_TYPES)
  targetType?: AdminAuditTargetType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetId?: string;

  @ApiPropertyOptional({ enum: ADMIN_AUDIT_RESULTS })
  @IsOptional()
  @IsIn(ADMIN_AUDIT_RESULTS)
  result?: AdminAuditResult;

  @ApiPropertyOptional({ example: '2026-07-09T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-09T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
