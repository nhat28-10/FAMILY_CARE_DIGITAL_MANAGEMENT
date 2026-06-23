import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ example: '123456', description: 'Mã OTP 6 số gửi qua email' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Mã xác thực phải gồm 6 chữ số' })
  code!: string;
}
