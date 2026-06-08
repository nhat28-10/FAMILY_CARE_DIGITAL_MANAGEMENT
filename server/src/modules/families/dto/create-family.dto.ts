import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Relationship } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateFamilyDto {
  @ApiProperty({ example: 'Nguyen Family' })
  @IsString()
  @IsNotEmpty({ message: 'Family name is required' })
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    enum: Relationship,
    description: "The creator's relationship within the family",
    example: Relationship.FATHER,
  })
  @IsOptional()
  @IsEnum(Relationship)
  relationship?: Relationship;
}
