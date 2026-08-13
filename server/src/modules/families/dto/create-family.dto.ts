import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Relationship } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateFamilyDto {
  @ApiProperty({ example: 'Nguyen Family' })
  @IsString()
  @IsNotEmpty({ message: 'Family name is required' })
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'Our family workspace' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/family.png' })
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  avatarUrl?: string;

  @ApiPropertyOptional({
    enum: Relationship,
    description: "The creator's relationship within the family",
    example: Relationship.FATHER,
  })
  @IsOptional()
  @IsEnum(Relationship)
  relationship?: Relationship;
}
