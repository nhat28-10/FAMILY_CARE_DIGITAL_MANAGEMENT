import { ApiProperty } from '@nestjs/swagger';
import { FinancialGoalStatus } from '@prisma/client';

export class FinanceJarSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  financeModelId!: string;

  @ApiProperty({ example: 'Emergency fund' })
  name!: string;

  @ApiProperty({ example: 'EMERGENCY' })
  jarCode!: string;

  @ApiProperty({ type: Number, example: 10 })
  allocationPercentage!: number;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class FinancialGoalResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  familyId!: string;

  @ApiProperty({ example: 'Quỹ dự phòng khẩn cấp' })
  goalName!: string;

  @ApiProperty({ type: Number, example: 30000000 })
  targetAmount!: number;

  @ApiProperty({ type: String, format: 'date', nullable: true })
  deadline!: string | null;

  @ApiProperty({ type: Number, example: 3000000, nullable: true })
  monthlyContributionTarget!: number | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  relatedJarId!: string | null;

  @ApiProperty({ enum: FinancialGoalStatus })
  status!: FinancialGoalStatus;

  @ApiProperty({ format: 'uuid' })
  createdByMemberId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: () => FinanceJarSummaryResponseDto, nullable: true })
  relatedJar!: FinanceJarSummaryResponseDto | null;
}

export class FinancialGoalProgressResponseDto {
  @ApiProperty({ type: Number, example: 12000000 })
  currentAmount!: number;

  @ApiProperty({ type: Number, example: 30000000 })
  targetAmount!: number;

  @ApiProperty({ type: Number, example: 18000000 })
  remainingAmount!: number;

  @ApiProperty({ type: Number, example: 40 })
  progressPercent!: number;

  @ApiProperty({ type: Number, nullable: true, example: 90 })
  daysRemaining!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 3 })
  monthsRemaining!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 3000000 })
  monthlyContributionTarget!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 6000000 })
  recommendedMonthlyContribution!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 21000000 })
  projectedAmountByDeadline!: number | null;

  @ApiProperty()
  isAchieved!: boolean;

  @ApiProperty()
  isAtRisk!: boolean;

  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH'], nullable: true })
  riskSeverity!: 'LOW' | 'MEDIUM' | 'HIGH' | null;
}

export class FinancialGoalDetailResponseDto {
  @ApiProperty({ type: () => FinancialGoalResponseDto })
  goal!: FinancialGoalResponseDto;

  @ApiProperty({ type: () => FinancialGoalProgressResponseDto })
  progress!: FinancialGoalProgressResponseDto;
}

export class FinancialGoalDetailApiResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ example: 'Lấy mục tiêu tài chính thành công' })
  message!: string;

  @ApiProperty({ type: () => FinancialGoalDetailResponseDto })
  data!: FinancialGoalDetailResponseDto;
}
