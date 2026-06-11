import { ApiProperty } from '@nestjs/swagger';
import { FinanceModelType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateFinanceModelDto {
  @ApiProperty({ enum: FinanceModelType, example: FinanceModelType.FIVE_JARS })
  @IsEnum(FinanceModelType)
  modelType!: FinanceModelType;

  @ApiProperty({ example: 'Family five jars plan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
