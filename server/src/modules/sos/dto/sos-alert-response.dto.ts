import { ApiProperty } from '@nestjs/swagger';
import {
  DevicePairingStatus,
  GpsSourceType,
  SosAlertStatus,
  SosResponseType,
  SosSeverity,
  SosSourceType,
  WearableDeviceType,
} from '@prisma/client';

export class SosMemberUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Nguyễn Văn A' })
  fullName!: string | null;

  @ApiProperty({ example: 'member@example.com' })
  email!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://cdn.example.com/avatar.png',
  })
  avatarUrl!: string | null;
}

export class SosMemberSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Ba' })
  displayName!: string | null;

  @ApiProperty({ example: 'FAMILY_MEMBER' })
  familyRole!: string;

  @ApiProperty({ type: () => SosMemberUserResponseDto })
  user!: SosMemberUserResponseDto;
}

export class SosWearableDeviceResponseDto {
  @ApiProperty({ format: 'uuid' })
  deviceId!: string;

  @ApiProperty({ format: 'uuid' })
  workspaceId!: string;

  @ApiProperty({ format: 'uuid' })
  ownerMemberId!: string;

  @ApiProperty({ example: 'Đồng hồ của Ba' })
  deviceName!: string;

  @ApiProperty({ enum: WearableDeviceType })
  deviceType!: WearableDeviceType;

  @ApiProperty({ example: 'watch-serial-001' })
  deviceIdentifier!: string;

  @ApiProperty({ enum: DevicePairingStatus })
  pairingStatus!: DevicePairingStatus;

  @ApiProperty()
  gpsEnabled!: boolean;

  @ApiProperty()
  sosEnabled!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastSeenAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class SosLocationPointResponseDto {
  @ApiProperty({ format: 'uuid' })
  locationPointId!: string;

  @ApiProperty({ format: 'uuid' })
  sosAlertId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  deviceId!: string | null;

  @ApiProperty({ type: Number, example: 10.762622 })
  latitude!: number;

  @ApiProperty({ type: Number, example: 106.660172 })
  longitude!: number;

  @ApiProperty({ type: Number, nullable: true, example: 12.5 })
  accuracy!: number | null;

  @ApiProperty({ enum: GpsSourceType })
  sourceType!: GpsSourceType;

  @ApiProperty({ type: String, format: 'date-time' })
  recordedAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class SosResponseResponseDto {
  @ApiProperty({ format: 'uuid' })
  responseId!: string;

  @ApiProperty({ format: 'uuid' })
  sosAlertId!: string;

  @ApiProperty({ format: 'uuid' })
  responderMemberId!: string;

  @ApiProperty({ enum: SosResponseType })
  responseType!: SosResponseType;

  @ApiProperty({ type: String, nullable: true })
  message!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  respondedAt!: string;

  @ApiProperty({ type: () => SosMemberSummaryResponseDto })
  responderMember!: SosMemberSummaryResponseDto;
}

export class SosAlertResponseDto {
  @ApiProperty({ format: 'uuid' })
  sosAlertId!: string;

  @ApiProperty({ format: 'uuid' })
  workspaceId!: string;

  @ApiProperty({ format: 'uuid' })
  triggeredByMemberId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  deviceId!: string | null;

  @ApiProperty({ enum: SosSourceType })
  sourceType!: SosSourceType;

  @ApiProperty({ enum: SosAlertStatus })
  status!: SosAlertStatus;

  @ApiProperty({ enum: SosSeverity, nullable: true })
  severity!: SosSeverity | null;

  @ApiProperty({ type: Number, nullable: true, example: 10.762622 })
  initialLatitude!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 106.660172 })
  initialLongitude!: number | null;

  @ApiProperty({ type: String, nullable: true })
  message!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  triggeredAt!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  resolvedByMemberId!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  resolvedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  resolutionNote!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: () => SosMemberSummaryResponseDto })
  triggeredByMember!: SosMemberSummaryResponseDto;

  @ApiProperty({ type: () => SosMemberSummaryResponseDto, nullable: true })
  resolvedByMember!: SosMemberSummaryResponseDto | null;

  @ApiProperty({ type: () => SosWearableDeviceResponseDto, nullable: true })
  device!: SosWearableDeviceResponseDto | null;

  @ApiProperty({ type: () => [SosResponseResponseDto] })
  responses!: SosResponseResponseDto[];

  @ApiProperty({ type: () => [SosLocationPointResponseDto] })
  locationPoints!: SosLocationPointResponseDto[];
}

export class SosAlertCountResponseDto {
  @ApiProperty({ example: 2 })
  responses!: number;

  @ApiProperty({ example: 15 })
  locationPoints!: number;
}

export class SosAlertListItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  sosAlertId!: string;

  @ApiProperty({ format: 'uuid' })
  workspaceId!: string;

  @ApiProperty({ format: 'uuid' })
  triggeredByMemberId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  deviceId!: string | null;

  @ApiProperty({ enum: SosSourceType })
  sourceType!: SosSourceType;

  @ApiProperty({ enum: SosAlertStatus })
  status!: SosAlertStatus;

  @ApiProperty({ enum: SosSeverity, nullable: true })
  severity!: SosSeverity | null;

  @ApiProperty({ type: Number, nullable: true, example: 10.762622 })
  initialLatitude!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 106.660172 })
  initialLongitude!: number | null;

  @ApiProperty({ type: String, nullable: true })
  message!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  triggeredAt!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  resolvedByMemberId!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  resolvedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  resolutionNote!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: () => SosMemberSummaryResponseDto })
  triggeredByMember!: SosMemberSummaryResponseDto;

  @ApiProperty({ type: () => SosMemberSummaryResponseDto, nullable: true })
  resolvedByMember!: SosMemberSummaryResponseDto | null;

  @ApiProperty({ type: () => SosAlertCountResponseDto })
  _count!: SosAlertCountResponseDto;
}

export class SosAlertApiResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ example: 'Lấy chi tiết cảnh báo SOS thành công' })
  message!: string;

  @ApiProperty({ type: () => SosAlertResponseDto })
  data!: SosAlertResponseDto;
}

export class SosAlertListApiResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ example: 'Lấy danh sách cảnh báo SOS thành công' })
  message!: string;

  @ApiProperty({ type: () => [SosAlertListItemResponseDto] })
  data!: SosAlertListItemResponseDto[];
}
