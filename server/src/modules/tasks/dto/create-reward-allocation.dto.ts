import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'rewardAllocationTarget', async: false })
class RewardAllocationTargetConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const item = args.object as RewardAllocationItemDto;
    return Boolean(item.jarId || item.goalId);
  }

  defaultMessage() {
    return 'Mỗi phân bổ phải chọn quỹ hoặc mục tiêu tài chính';
  }
}

@ValidatorConstraint({ name: 'rewardAllocationTotal', async: false })
class RewardAllocationTotalConstraint implements ValidatorConstraintInterface {
  validate(value: RewardAllocationItemDto[]) {
    if (!Array.isArray(value)) {
      return false;
    }
    return (
      value.reduce((total, item) => total + Number(item?.amount ?? 0), 0) > 0
    );
  }

  defaultMessage() {
    return 'Tổng số tiền phân bổ phải lớn hơn 0';
  }
}

export class RewardAllocationItemDto {
  @ApiProperty({
    example: 50000,
    minimum: 0.01,
    description: 'Số tiền phân bổ vào quỹ hoặc mục tiêu tài chính',
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Số tiền phân bổ không hợp lệ' },
  )
  @Min(0.01, { message: 'Số tiền phân bổ phải lớn hơn 0' })
  amount!: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'ID quỹ tài chính nhận phân bổ',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Quỹ tài chính không hợp lệ' })
  jarId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'ID mục tiêu tài chính nhận phân bổ',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Mục tiêu tài chính không hợp lệ' })
  goalId?: string;

  @Validate(RewardAllocationTargetConstraint)
  private readonly targetValidator?: boolean;
}

export class CreateRewardAllocationDto {
  @ApiProperty({
    type: [RewardAllocationItemDto],
    description: 'Danh sách phân bổ thưởng vào quỹ hoặc mục tiêu tài chính',
  })
  @IsArray({ message: 'Danh sách phân bổ thưởng phải là mảng' })
  @ArrayMinSize(1, { message: 'Cần có ít nhất một phân bổ thưởng' })
  @ValidateNested({ each: true })
  @Type(() => RewardAllocationItemDto)
  @Validate(RewardAllocationTotalConstraint)
  allocations!: RewardAllocationItemDto[];
}
