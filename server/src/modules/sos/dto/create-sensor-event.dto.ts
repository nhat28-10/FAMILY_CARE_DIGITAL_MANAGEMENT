import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SensorEventType, SosSeverity } from '@prisma/client';
import { IsDateString, IsEnum, IsObject, IsOptional } from 'class-validator';

export class CreateSensorEventDto {
  @ApiProperty({ enum: SensorEventType })
  @IsEnum(SensorEventType)
  eventType!: SensorEventType;

  @ApiPropertyOptional({ enum: SosSeverity })
  @IsOptional()
  @IsEnum(SosSeverity)
  severity?: SosSeverity;

  @ApiPropertyOptional({
    description: 'Số liệu thô từ cảm biến (JSON tùy thiết bị)',
    example: { gForce: 3.2, heartRate: 142 },
  })
  @IsOptional()
  @IsObject()
  rawValue?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Thời điểm phát hiện (ISO8601), mặc định là hiện tại',
    example: '2026-07-16T08:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  detectedAt?: string;
}
