import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FamilyRole, MemberStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AddAlbumMediaTagDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  taggedMemberId!: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500)
  tagNote?: string;
}

export class AlbumTagMemberResponseDto {
  @ApiProperty({ format: 'uuid' })
  memberId!: string;

  @ApiProperty({ example: 'ngia' })
  displayName!: string;

  @ApiProperty({ example: 'https://example.com/avatar.png', nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ enum: FamilyRole, example: FamilyRole.FAMILY_MEMBER })
  familyRole!: FamilyRole;

  @ApiProperty({ enum: MemberStatus, example: MemberStatus.ACTIVE })
  memberStatus!: MemberStatus;
}

export class AlbumTagCreatorResponseDto {
  @ApiProperty({ format: 'uuid' })
  memberId!: string;

  @ApiProperty({ example: 'ngia' })
  displayName!: string;
}

export class AlbumTagPermissionsResponseDto {
  @ApiProperty({ example: true })
  canRemove!: boolean;
}

export class AlbumTagResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'Stable family member id used by FE to filter already-tagged face suggestions.',
  })
  taggedMemberId!: string;

  @ApiProperty({ format: 'uuid' })
  taggedByMemberId!: string;

  @ApiProperty({ example: 'Confirmed from face suggestion', nullable: true })
  tagNote!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: () => AlbumTagMemberResponseDto })
  taggedMember!: AlbumTagMemberResponseDto;

  @ApiProperty({ type: () => AlbumTagCreatorResponseDto })
  taggedBy!: AlbumTagCreatorResponseDto;

  @ApiProperty({ type: () => AlbumTagPermissionsResponseDto })
  permissions!: AlbumTagPermissionsResponseDto;
}

export class AlbumTagListDataResponseDto {
  @ApiProperty({ type: () => [AlbumTagResponseDto] })
  items!: AlbumTagResponseDto[];

  @ApiProperty({ example: 1 })
  total!: number;
}

export class AlbumTagApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Gắn thẻ thành viên thành công' })
  message!: string;

  @ApiProperty({ type: () => AlbumTagResponseDto })
  data!: AlbumTagResponseDto;
}

export class AlbumTagListApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Lấy danh sách tag thành công' })
  message!: string;

  @ApiProperty({ type: () => AlbumTagListDataResponseDto })
  data!: AlbumTagListDataResponseDto;
}

class AlbumTagRemoveDataResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: true })
  removed!: boolean;
}

export class AlbumTagRemoveApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Gỡ tag thành công' })
  message!: string;

  @ApiProperty({ type: () => AlbumTagRemoveDataResponseDto })
  data!: AlbumTagRemoveDataResponseDto;
}
