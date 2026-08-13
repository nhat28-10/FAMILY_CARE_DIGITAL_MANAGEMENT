import { ApiPropertyOptional } from '@nestjs/swagger';
import { FamilyRole, Relationship } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

/**
 * Manager chọn vai trò/quan hệ lúc duyệt; bỏ trống dùng default
 * FAMILY_MEMBER / OTHER.
 */
export class ApproveJoinRequestDto {
  @ApiPropertyOptional({ enum: FamilyRole, default: FamilyRole.FAMILY_MEMBER })
  @IsOptional()
  @IsEnum(FamilyRole)
  familyRole?: FamilyRole;

  @ApiPropertyOptional({ enum: Relationship, default: Relationship.OTHER })
  @IsOptional()
  @IsEnum(Relationship)
  relationship?: Relationship;
}
