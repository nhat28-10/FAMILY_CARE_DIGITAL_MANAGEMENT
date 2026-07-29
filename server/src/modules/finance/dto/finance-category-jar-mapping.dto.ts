import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class FinanceCategoryJarMappingQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  financeModelId?: string;
}

export class UpsertFinanceCategoryJarMappingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  financeModelId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  jarId!: string;
}
