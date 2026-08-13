import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProvisioningStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const RETRY_PROVISIONING_RESULTS = [
  ProvisioningStatus.SUCCESS,
  ProvisioningStatus.FAILED,
] as const;

export type RetryProvisioningResult =
  (typeof RETRY_PROVISIONING_RESULTS)[number];

export class RetryProvisioningDto {
  @ApiPropertyOptional({
    enum: RETRY_PROVISIONING_RESULTS,
    default: ProvisioningStatus.SUCCESS,
  })
  @IsOptional()
  @IsIn(RETRY_PROVISIONING_RESULTS, {
    message: 'Kết quả mô phỏng provisioning không hợp lệ.',
  })
  simulateResult?: RetryProvisioningResult;

  @ApiPropertyOptional({
    example: 'Retry activation thủ công cho workspace',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
