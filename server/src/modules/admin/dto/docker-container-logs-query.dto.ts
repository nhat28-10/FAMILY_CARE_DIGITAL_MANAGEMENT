import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const booleanQueryTransform = ({ value }: { value: unknown }): unknown => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
};

export class DockerContainerLogsQueryDto {
  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  tail: number = 100;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(booleanQueryTransform)
  @IsBoolean()
  timestamps: boolean = true;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(booleanQueryTransform)
  @IsBoolean()
  stdout: boolean = true;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(booleanQueryTransform)
  @IsBoolean()
  stderr: boolean = true;

  @ApiPropertyOptional({
    description: 'Docker log since value, for example an RFC3339 timestamp',
  })
  @IsOptional()
  @IsString()
  since?: string;

  @ApiPropertyOptional({
    description: 'Docker log until value, for example an RFC3339 timestamp',
  })
  @IsOptional()
  @IsString()
  until?: string;
}
