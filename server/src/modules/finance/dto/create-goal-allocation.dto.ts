import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator';

export class CreateGoalAllocationDto {
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Optional existing ledger entry. When omitted, the backend creates a contribution entry for this goal allocation.',
  })
  @IsOptional()
  @IsUUID()
  ledgerEntryId?: string | null;

  @ApiProperty({ example: 1000000, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;
}
