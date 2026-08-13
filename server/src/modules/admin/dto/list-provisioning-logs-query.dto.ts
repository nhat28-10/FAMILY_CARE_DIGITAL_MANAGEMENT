import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProvisioningActionType, ProvisioningStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListProvisioningLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'ID family workspace' })
  @IsOptional()
  @IsString()
  familyId?: string;

  @ApiPropertyOptional({ enum: ProvisioningStatus })
  @IsOptional()
  @IsEnum(ProvisioningStatus)
  status?: ProvisioningStatus;

  @ApiPropertyOptional({ enum: ProvisioningActionType })
  @IsOptional()
  @IsEnum(ProvisioningActionType)
  actionType?: ProvisioningActionType;
}
