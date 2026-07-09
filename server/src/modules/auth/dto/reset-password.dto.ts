import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

import { PASSWORD_REGEX, PASSWORD_RULE } from './password.constants';

export class ResetPasswordDto {
  @ApiProperty({ example: 'john.doe@example.com' })
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email!: string;

  @ApiProperty({ example: '123456', description: 'Mã OTP 6 số gửi qua email' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Mã xác thực phải gồm 6 chữ số' })
  code!: string;

  @ApiProperty({
    example: 'NewStr0ng@Pass',
    description: PASSWORD_RULE,
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: PASSWORD_RULE })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULE })
  newPassword!: string;
}
