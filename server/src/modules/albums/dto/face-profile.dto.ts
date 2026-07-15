import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsString } from 'class-validator';

export class EnrollFaceProfileDto {
  @ApiProperty({ example: true })
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  @Equals(true, { message: 'consentConfirmed must be true' })
  consentConfirmed!: true;
}

export class DeleteFaceProfileDto {
  @ApiProperty({ example: 'DELETE_FACE_PROFILE' })
  @IsString()
  @Equals('DELETE_FACE_PROFILE')
  confirmation!: 'DELETE_FACE_PROFILE';
}
