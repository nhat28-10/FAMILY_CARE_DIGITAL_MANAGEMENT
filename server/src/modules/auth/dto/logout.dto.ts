import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsJWT, IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional({
    description:
      'Refresh token of the current device. If provided, only that session is ' +
      'revoked; otherwise all sessions of the user are revoked.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsOptional()
  @IsString()
  @IsJWT({ message: 'Refresh token must be a valid JWT' })
  refreshToken?: string;
}
