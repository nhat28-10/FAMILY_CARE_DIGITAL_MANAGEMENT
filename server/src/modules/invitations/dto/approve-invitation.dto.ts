import { ApiPropertyOptional } from '@nestjs/swagger';
import { FamilyRole, Relationship } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

/**
 * Optional overrides a Family Manager can apply when approving a join request.
 * Per the ERD, the manager picks the role/relationship at approval time;
 * omitted fields fall back to whatever was set on the invitation.
 */
export class ApproveInvitationDto {
  @ApiPropertyOptional({ enum: FamilyRole })
  @IsOptional()
  @IsEnum(FamilyRole)
  familyRole?: FamilyRole;

  @ApiPropertyOptional({ enum: Relationship })
  @IsOptional()
  @IsEnum(Relationship)
  relationship?: Relationship;
}
