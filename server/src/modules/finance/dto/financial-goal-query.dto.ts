import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FinancialGoalStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class FinancialGoalQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FinancialGoalStatus })
  @IsOptional()
  @IsEnum(FinancialGoalStatus)
  status?: FinancialGoalStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  relatedJarId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === 'true',
  )
  @IsBoolean()
  includeProgress: boolean = false;
}
