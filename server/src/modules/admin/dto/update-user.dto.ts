import { ApiPropertyOptional } from '@nestjs/swagger';
import { AccountStatus, VerificationStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

/** Admin-editable fields of a user. Password and email are intentionally excluded. */
export class AdminUpdateUserDto {
  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  accountStatus?: AccountStatus;

  @ApiPropertyOptional({ enum: VerificationStatus })
  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional({ example: '+84901234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.png' })
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  avatarUrl?: string;
}
