import { ApiProperty } from '@nestjs/swagger';
import { InvitationStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class AdminUpdateInvitationDto {
  @ApiProperty({ enum: InvitationStatus })
  @IsEnum(InvitationStatus)
  status!: InvitationStatus;
}
