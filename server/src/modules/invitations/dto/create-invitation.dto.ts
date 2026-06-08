import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FamilyRole, Relationship } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional } from 'class-validator';

export class CreateInvitationDto {
  @ApiProperty({ example: 'member@example.com' })
  @IsEmail({}, { message: 'A valid invitee email is required' })
  email!: string;

  @ApiPropertyOptional({
    enum: FamilyRole,
    default: FamilyRole.MEMBER,
    description: 'Family role the invitee will receive on accept',
  })
  @IsOptional()
  @IsEnum(FamilyRole)
  familyRole?: FamilyRole;

  @ApiPropertyOptional({ enum: Relationship, default: Relationship.OTHER })
  @IsOptional()
  @IsEnum(Relationship)
  relationship?: Relationship;
}
