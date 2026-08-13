import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
