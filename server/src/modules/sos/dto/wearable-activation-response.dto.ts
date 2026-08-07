import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WearableActivationStatus } from '@prisma/client';

export class WearableActivationResponseDto {
  @ApiProperty({ format: 'uuid' })
  sessionId!: string;

  @ApiProperty({ example: 'FCW-8SRERK' })
  code!: string;

  @ApiProperty({ enum: WearableActivationStatus })
  status!: WearableActivationStatus;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: Date;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  familyId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  deviceId?: string | null;
}

export class WearableActivationClaimResponseDto {
  @ApiProperty({ type: () => WearableActivationResponseDto })
  activation!: WearableActivationResponseDto;

  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty()
  user!: unknown;
}
