import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

const PASSWORD_RULE =
  'Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number and one special character';

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
}
