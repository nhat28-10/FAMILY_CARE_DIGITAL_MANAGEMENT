import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EssentialType,
  FinanceCategoryStatus,
  FinanceCategoryType,
  FinanceModelStatus,
  FinanceModelType,
} from '@prisma/client';
import { IsOptional, IsUUID } from 'class-validator';

export class FinanceCategoryJarMappingQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  financeModelId?: string;
}

export class UpsertFinanceCategoryJarMappingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  financeModelId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  jarId!: string;
}

class CategoryJarMappingFinanceModelResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  familyId!: string;

  @ApiProperty({
    enum: FinanceModelType,
    example: FinanceModelType.EIGHTY_TWENTY,
  })
  modelType!: FinanceModelType;

  @ApiProperty({ example: '80/20' })
  name!: string;

  @ApiProperty({ enum: FinanceModelStatus, example: FinanceModelStatus.ACTIVE })
  status!: FinanceModelStatus;

  @ApiProperty({ example: '2026-07-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-07-01T00:00:00.000Z' })
  updatedAt!: string;
}

class CategoryJarMappingCategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  familyId!: string;

  @ApiProperty({ example: 'Ăn uống' })
  name!: string;

  @ApiProperty({
    enum: FinanceCategoryType,
    example: FinanceCategoryType.EXPENSE,
  })
  categoryType!: FinanceCategoryType;

  @ApiProperty({ enum: EssentialType, example: EssentialType.ESSENTIAL })
  essentialType!: EssentialType;

  @ApiProperty({
    enum: FinanceCategoryStatus,
    example: FinanceCategoryStatus.ACTIVE,
  })
  status!: FinanceCategoryStatus;

  @ApiProperty({ example: '2026-07-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-07-01T00:00:00.000Z' })
  updatedAt!: string;
}

class CategoryJarMappingJarResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  financeModelId!: string;

  @ApiProperty({ example: 'Spending' })
  name!: string;

  @ApiProperty({ example: 'SPENDING' })
  jarCode!: string;

  @ApiProperty({
    example: 80,
    description:
      'Target percentage of this jar inside the selected finance model.',
  })
  allocationPercentage!: number;

  @ApiProperty({ example: 'Daily spending jar', nullable: true })
  description!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-07-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-07-01T00:00:00.000Z' })
  updatedAt!: string;
}

export class CategoryJarMappingItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  familyId!: string;

  @ApiProperty({ format: 'uuid' })
  financeModelId!: string;

  @ApiProperty({ format: 'uuid' })
  categoryId!: string;

  @ApiProperty({ format: 'uuid' })
  jarId!: string;

  @ApiProperty({ example: '2026-07-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-07-01T00:00:00.000Z' })
  updatedAt!: string;

  @ApiProperty({ type: () => CategoryJarMappingFinanceModelResponseDto })
  financeModel!: CategoryJarMappingFinanceModelResponseDto;

  @ApiProperty({ type: () => CategoryJarMappingCategoryResponseDto })
  category!: CategoryJarMappingCategoryResponseDto;

  @ApiProperty({ type: () => CategoryJarMappingJarResponseDto })
  jar!: CategoryJarMappingJarResponseDto;
}

class CategoryJarMappingListDataResponseDto {
  @ApiProperty({
    type: () => CategoryJarMappingFinanceModelResponseDto,
    nullable: true,
    description:
      'Selected finance model. Null when financeModelId is omitted and the family has no ACTIVE model.',
  })
  financeModel!: CategoryJarMappingFinanceModelResponseDto | null;

  @ApiProperty({
    type: () => [CategoryJarMappingItemResponseDto],
    description: 'Empty array when no mappings exist for the selected model.',
  })
  items!: CategoryJarMappingItemResponseDto[];
}

export class CategoryJarMappingListApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({
    example: 'Lấy mapping danh mục - hũ tài chính thành công',
  })
  message!: string;

  @ApiProperty({ type: () => CategoryJarMappingListDataResponseDto })
  data!: CategoryJarMappingListDataResponseDto;
}

export class CategoryJarMappingDetailApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({
    example: 'Cấu hình mapping danh mục - hũ tài chính thành công',
  })
  message!: string;

  @ApiProperty({ type: () => CategoryJarMappingItemResponseDto })
  data!: CategoryJarMappingItemResponseDto;
}

export class CategoryJarMappingDeleteApiResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Xóa mapping danh mục - hũ tài chính thành công' })
  message!: string;

  @ApiProperty({ type: () => CategoryJarMappingItemResponseDto })
  data!: CategoryJarMappingItemResponseDto;
}

export const CATEGORY_JAR_MAPPING_ITEM_EXAMPLE = {
  id: 'mapping-1',
  familyId: 'family-1',
  financeModelId: 'model-80-20',
  categoryId: 'category-food',
  jarId: 'jar-spending',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  financeModel: {
    id: 'model-80-20',
    familyId: 'family-1',
    modelType: 'EIGHTY_TWENTY',
    name: '80/20',
    status: 'ACTIVE',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  category: {
    id: 'category-food',
    familyId: 'family-1',
    name: 'Ăn uống',
    categoryType: 'EXPENSE',
    essentialType: 'ESSENTIAL',
    status: 'ACTIVE',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  jar: {
    id: 'jar-spending',
    financeModelId: 'model-80-20',
    name: 'Spending',
    jarCode: 'SPENDING',
    allocationPercentage: 80,
    description: 'Daily spending jar',
    isActive: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
};

export const CATEGORY_JAR_MAPPING_LIST_RESPONSE_EXAMPLE = {
  success: true,
  message: 'Lấy mapping danh mục - hũ tài chính thành công',
  data: {
    financeModel: CATEGORY_JAR_MAPPING_ITEM_EXAMPLE.financeModel,
    items: [CATEGORY_JAR_MAPPING_ITEM_EXAMPLE],
  },
};

export const CATEGORY_JAR_MAPPING_DETAIL_RESPONSE_EXAMPLE = {
  success: true,
  message: 'Cấu hình mapping danh mục - hũ tài chính thành công',
  data: CATEGORY_JAR_MAPPING_ITEM_EXAMPLE,
};

export const CATEGORY_JAR_MAPPING_DELETE_RESPONSE_EXAMPLE = {
  success: true,
  message: 'Xóa mapping danh mục - hũ tài chính thành công',
  data: CATEGORY_JAR_MAPPING_ITEM_EXAMPLE,
};
