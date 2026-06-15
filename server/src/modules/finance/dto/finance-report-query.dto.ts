import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsUUID } from 'class-validator';

const booleanTransform = ({ value }: { value: unknown }) =>
  value === true || value === 'true';

export class FinanceReportQueryDto {
  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  budgetPlanId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(booleanTransform)
  @IsBoolean()
  includeAlerts: boolean = true;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(booleanTransform)
  @IsBoolean()
  includeGoals: boolean = true;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(booleanTransform)
  @IsBoolean()
  includeBreakdown: boolean = true;
}
