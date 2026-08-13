import { ApiProperty } from '@nestjs/swagger';
import { FinanceModelType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateFinanceModelDto {
  @ApiProperty({ enum: FinanceModelType, example: FinanceModelType.FIVE_JARS })
  @IsEnum(FinanceModelType)
  modelType!: FinanceModelType;

  @ApiProperty({ example: 'Kế hoạch 5 hũ của gia đình' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
