import { ApiProperty } from '@nestjs/swagger';
import { SensorEventType, SosSeverity } from '@prisma/client';

export class SensorEventResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  deviceId!: string;

  @ApiProperty({ enum: SensorEventType })
  eventType!: SensorEventType;

  @ApiProperty({
    type: Object,
    nullable: true,
    example: { heartRate: 38, thresholdLow: 50, durationSeconds: 30 },
  })
  rawValue!: Record<string, unknown> | null;

  @ApiProperty({ enum: SosSeverity, nullable: true })
  severity!: SosSeverity | null;

  @ApiProperty({ type: String, format: 'date-time' })
  detectedAt!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  createdSosAlertId!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class WearableEventIngestResponseDto {
  @ApiProperty({ type: () => SensorEventResponseDto })
  event!: SensorEventResponseDto;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Newly created SOS alert id, or existing ACTIVE alert id when alertCreated=false due to duplicate active SOS.',
  })
  alertId!: string | null;

  @ApiProperty({
    example: true,
    description:
      'true only when this event created a new SOS alert. false for non-SOS events or duplicate active SOS.',
  })
  alertCreated!: boolean;
}

export class WearableEventIngestApiResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ example: 'Da ghi nhan su kien cam bien' })
  message!: string;

  @ApiProperty({ type: () => WearableEventIngestResponseDto })
  data!: WearableEventIngestResponseDto;
}
