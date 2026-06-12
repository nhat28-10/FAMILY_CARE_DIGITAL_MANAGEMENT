import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class CreateGoalAllocationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  ledgerEntryId!: string;

  @ApiProperty({ example: 1000000, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;
}
