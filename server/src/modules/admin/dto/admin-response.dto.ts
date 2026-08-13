import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class StatusDto {
  @ApiProperty({ example: 'UP' })
  status!: string;
}

export class AdminSystemHealthBackendDto extends StatusDto {
  @ApiProperty({ example: 12345 })
  uptimeSeconds!: number;
}

export class AdminSystemHealthDatabaseDto extends StatusDto {
  @ApiPropertyOptional({ example: 12, nullable: true })
  latencyMs!: number | null;
}

export class AdminSystemHealthResponseDto {
  @ApiProperty({ type: AdminSystemHealthBackendDto })
  backend!: AdminSystemHealthBackendDto;

  @ApiProperty({ type: AdminSystemHealthDatabaseDto })
  database!: AdminSystemHealthDatabaseDto;

  @ApiProperty({ example: 'System is healthy.' })
  message!: string;
}

export class AdminRuntimeMemoryUsageDto {
  @ApiProperty({ example: 93298688 })
  rss!: number;

  @ApiProperty({ example: 41390080 })
  heapUsed!: number;

  @ApiProperty({ example: 68026368 })
  heapTotal!: number;
}

export class AdminRuntimeNodeDto {
  @ApiProperty({ example: 'v20.19.0' })
  version!: string;

  @ApiProperty({ example: 'production' })
  environment!: string;
}

export class AdminRuntimeProcessDto {
  @ApiProperty({ example: 12345 })
  uptimeSeconds!: number;

  @ApiProperty({ example: 1 })
  pid!: number;
}

export class AdminRuntimeMemoryDto {
  @ApiProperty({ example: 88.98 })
  rssMb!: number;

  @ApiProperty({ example: 39.47 })
  heapUsedMb!: number;

  @ApiProperty({ example: 64.88 })
  heapTotalMb!: number;
}

export class AdminRuntimeSystemDto {
  @ApiProperty({ example: 'linux' })
  platform!: string;

  @ApiProperty({ example: 'x64' })
  arch!: string;

  @ApiProperty({ example: 2 })
  cpuCount!: number;
}

export class AdminSystemRuntimeResponseDto {
  @ApiProperty({ example: 'v20.19.0' })
  nodeVersion!: string;

  @ApiProperty({ example: 'v20.19.0' })
  node_version!: string;

  @ApiProperty({ example: 1 })
  pid!: number;

  @ApiProperty({ example: 12345 })
  uptime!: number;

  @ApiProperty({ type: AdminRuntimeMemoryUsageDto })
  memoryUsage!: AdminRuntimeMemoryUsageDto;

  @ApiProperty({ type: AdminRuntimeNodeDto })
  node!: AdminRuntimeNodeDto;

  @ApiProperty({ type: AdminRuntimeProcessDto })
  process!: AdminRuntimeProcessDto;

  @ApiProperty({ type: AdminRuntimeMemoryDto })
  memory!: AdminRuntimeMemoryDto;

  @ApiProperty({ type: AdminRuntimeSystemDto })
  system!: AdminRuntimeSystemDto;
}

export class AdminInfrastructureHostOsDto {
  @ApiProperty({ example: 'linux' })
  platform!: string;

  @ApiProperty({ example: 'familycare_api' })
  hostname!: string;
}

export class AdminInfrastructureHostCpuDto {
  @ApiProperty({ example: 2 })
  cores!: number;

  @ApiProperty({ example: 'Intel(R) Xeon(R)' })
  model!: string | null;

  @ApiProperty({ example: 2 })
  cpuCount!: number;

  @ApiProperty({ type: [Number], example: [0.12, 0.08, 0.05] })
  loadAverage!: number[];
}

export class AdminInfrastructureHostMemoryDto {
  @ApiProperty({ example: 2147483648 })
  total!: number;

  @ApiProperty({ example: 1073741824 })
  free!: number;

  @ApiProperty({ example: 1073741824 })
  used!: number;

  @ApiProperty({ example: 2048 })
  totalMb!: number;

  @ApiProperty({ example: 1024 })
  freeMb!: number;

  @ApiProperty({ example: 1024 })
  usedMb!: number;

  @ApiProperty({ example: 50 })
  usedPercent!: number;
}

export class AdminInfrastructureHostDiskDto {
  @ApiPropertyOptional({ example: 'UNAVAILABLE' })
  status?: string;

  @ApiPropertyOptional({ example: 'Disk usage is unavailable.' })
  message?: string;

  @ApiPropertyOptional({ example: 53687091200 })
  total?: number;

  @ApiPropertyOptional({ example: 26843545600 })
  free?: number;

  @ApiPropertyOptional({ example: 26843545600 })
  used?: number;

  @ApiPropertyOptional({ example: 51200 })
  totalMb?: number;

  @ApiPropertyOptional({ example: 25600 })
  freeMb?: number;

  @ApiPropertyOptional({ example: 25600 })
  usedMb?: number;

  @ApiPropertyOptional({ example: 50 })
  usedPercent?: number;
}

export class AdminInfrastructureHostResponseDto {
  @ApiProperty({ type: AdminInfrastructureHostOsDto })
  os!: AdminInfrastructureHostOsDto;

  @ApiProperty({ type: AdminInfrastructureHostCpuDto })
  cpu!: AdminInfrastructureHostCpuDto;

  @ApiProperty({ type: AdminInfrastructureHostMemoryDto })
  memory!: AdminInfrastructureHostMemoryDto;

  @ApiProperty({ type: AdminInfrastructureHostDiskDto })
  disk!: AdminInfrastructureHostDiskDto;

  @ApiProperty({ example: 123456 })
  uptimeSeconds!: number;

  @ApiProperty({ example: 'Host metrics loaded.' })
  message!: string;
}

export class AdminDashboardUsersDto {
  @ApiProperty({ example: 120 })
  total!: number;

  @ApiProperty({ example: 98 })
  active!: number;

  @ApiProperty({ example: 2 })
  locked!: number;

  @ApiProperty({ example: 1 })
  disabled!: number;

  @ApiProperty({ example: 19 })
  pending!: number;
}

export class AdminDashboardFamiliesDto {
  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 39 })
  active!: number;

  @ApiProperty({ example: 1 })
  pending!: number;

  @ApiProperty({ example: 1 })
  suspended!: number;

  @ApiProperty({ example: 1 })
  expired!: number;
}

export class AdminDashboardSubscriptionsDto {
  @ApiProperty({ example: 18 })
  free!: number;

  @ApiProperty({ example: 0 })
  monthly!: number;

  @ApiProperty({ example: 24 })
  yearly!: number;

  @ApiProperty({ example: 40 })
  active!: number;

  @ApiProperty({ example: 1 })
  expired!: number;

  @ApiProperty({ example: 1 })
  canceled!: number;

  @ApiProperty({ example: 0 })
  pastDue!: number;
}

export class AdminDashboardPaymentsDto {
  @ApiProperty({ example: 5540000 })
  totalPaidAmount!: number;

  @ApiProperty({ example: 4 })
  paidCount!: number;

  @ApiProperty({ example: 1 })
  failedCount!: number;

  @ApiProperty({ example: 0 })
  pendingCount!: number;

  @ApiProperty({ example: 'vnd' })
  currency!: string;
}

export class AdminDashboardSummaryResponseDto {
  @ApiProperty({ type: AdminDashboardUsersDto })
  users!: AdminDashboardUsersDto;

  @ApiProperty({ type: AdminDashboardFamiliesDto })
  families!: AdminDashboardFamiliesDto;

  @ApiProperty({ type: AdminDashboardSubscriptionsDto })
  subscriptions!: AdminDashboardSubscriptionsDto;

  @ApiProperty({ type: AdminDashboardPaymentsDto })
  payments!: AdminDashboardPaymentsDto;
}

export class AdminRevenueSummaryResponseDto {
  @ApiProperty({ example: 5540000 })
  totalRevenue!: number;

  @ApiProperty({ example: 5540000 })
  currentMonthRevenue!: number;

  @ApiProperty({ example: 0 })
  monthlyPlanRevenue!: number;

  @ApiProperty({ example: 5540000 })
  yearlyPlanRevenue!: number;

  @ApiProperty({ example: 4 })
  paidPayments!: number;

  @ApiProperty({ example: 1 })
  failedPayments!: number;

  @ApiProperty({ example: 0 })
  pendingPayments!: number;

  @ApiProperty({ example: 'vnd' })
  currency!: string;
}

export class AdminPaymentFamilyDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ example: 'Nguyen Family', nullable: true })
  name!: string | null;
}

export class AdminPaymentListItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  paymentId!: string;

  @ApiProperty({ format: 'uuid' })
  familyId!: string;

  @ApiPropertyOptional({ example: 'Nguyen Family', nullable: true })
  familyName!: string | null;

  @ApiProperty({ type: AdminPaymentFamilyDto })
  family!: AdminPaymentFamilyDto;

  @ApiPropertyOptional({ example: 'YEARLY', nullable: true })
  planCode!: string | null;

  @ApiProperty({ example: 1390000 })
  amount!: number;

  @ApiProperty({ example: 'vnd' })
  currency!: string;

  @ApiProperty({ example: 'PAID', enum: ['PAID', 'FAILED', 'PENDING'] })
  status!: string;

  @ApiPropertyOptional({
    example: '2026-07-14T10:30:00.000Z',
    nullable: true,
  })
  paidAt!: Date | null;

  @ApiProperty({ example: '2026-07-14T10:30:00.000Z' })
  createdAt!: Date;
}

export class AdminPaymentsListResponseDto {
  @ApiProperty({ type: [AdminPaymentListItemResponseDto] })
  items!: AdminPaymentListItemResponseDto[];

  @ApiProperty({ example: 125 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 7 })
  totalPages!: number;
}
