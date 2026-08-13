import { ApiPropertyOptional } from '@nestjs/swagger';
import { ActivationStatus, WorkspaceStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class AdminUpdateFamilyDto {
  @ApiPropertyOptional({ example: 'Nguyen Family' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Our family workspace' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/family.png' })
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  avatarUrl?: string;

  @ApiPropertyOptional({ enum: WorkspaceStatus })
  @IsOptional()
  @IsEnum(WorkspaceStatus)
  status?: WorkspaceStatus;

  @ApiPropertyOptional({ enum: ActivationStatus })
  @IsOptional()
  @IsEnum(ActivationStatus)
  activationStatus?: ActivationStatus;
}
