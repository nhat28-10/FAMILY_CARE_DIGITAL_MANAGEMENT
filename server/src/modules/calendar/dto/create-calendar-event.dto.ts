import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateCalendarEventDto {
  @ApiProperty({ example: 'Khám sức khỏe định kỳ' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ example: 'Nhớ mang theo sổ khám bệnh.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'Bệnh viện Gia Định' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @ApiProperty({ example: '2026-08-01T09:00:00.000Z' })
  @IsDateString()
  startTime!: string;

  @ApiPropertyOptional({ example: '2026-08-01T10:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endTime?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isRecurring?: boolean;

  @ApiPropertyOptional({
    description:
      'Danh sách FamilyMember.id được mời. Bỏ trống để mời tất cả active members.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  participantMemberIds?: string[];

  @ApiPropertyOptional({
    default: false,
    description: 'Bật reminder cho participant khi tạo event.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  reminderEnabled?: boolean;
}
