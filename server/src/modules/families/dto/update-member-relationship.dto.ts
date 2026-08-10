import { ApiProperty } from '@nestjs/swagger';
import { Relationship } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateMemberRelationshipDto {
  @ApiProperty({ enum: Relationship })
  @IsEnum(Relationship)
  relationship!: Relationship;
}
