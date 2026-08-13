import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PASSWORD_REGEX, PASSWORD_RULE } from './password.constants';

export class RegisterDto {
  @ApiProperty({ example: 'john.doe@example.com' })
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email!: string;

  @ApiProperty({
    example: 'StrongP@ss1',
    description: PASSWORD_RULE,
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: PASSWORD_RULE })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULE })
  password!: string;

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
