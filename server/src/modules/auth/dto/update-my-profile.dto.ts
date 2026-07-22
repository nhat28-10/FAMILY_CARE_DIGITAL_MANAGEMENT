import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateMyProfileDto {
  @ApiPropertyOptional({ example: 'John Doe', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullName?: string | null;

  @ApiPropertyOptional({ example: '+84901234567', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/avatar.png',
    nullable: true,
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  avatarUrl?: string | null;
}
