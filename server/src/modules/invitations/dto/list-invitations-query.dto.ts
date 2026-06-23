import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvitationStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

/** Filter for a family manager browsing the workspace's invitations. */
export class ListInvitationsQueryDto {
  @ApiPropertyOptional({
    enum: InvitationStatus,
    description: 'Lọc theo trạng thái lời mời (vd CLAIMED để xem yêu cầu chờ duyệt)',
  })
  @IsOptional()
  @IsEnum(InvitationStatus)
  status?: InvitationStatus;
}
