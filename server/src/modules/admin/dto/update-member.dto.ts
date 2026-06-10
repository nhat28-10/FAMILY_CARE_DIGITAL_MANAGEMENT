import { ApiPropertyOptional } from '@nestjs/swagger';
import { FamilyRole, MemberStatus, Relationship } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminUpdateMemberDto {
  @ApiPropertyOptional({ enum: FamilyRole })
  @IsOptional()
  @IsEnum(FamilyRole)
  familyRole?: FamilyRole;

  @ApiPropertyOptional({ enum: Relationship })
  @IsOptional()
  @IsEnum(Relationship)
  relationship?: Relationship;

  @ApiPropertyOptional({ enum: MemberStatus })
  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;

  @ApiPropertyOptional({ example: 'Bố' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;
}
