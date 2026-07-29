import { ApiProperty } from '@nestjs/swagger';
import {
  FinanceModelType,
  LedgerEntryStatus,
  LedgerEntryType,
} from '@prisma/client';

class FundAllocationModelResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    example: 'Five Jars',
    nullable: true,
    description:
      'Nullable only for legacy history rows that cannot reconstruct the original model name.',
  })
  name!: string | null;

  @ApiProperty({
    enum: FinanceModelType,
    example: FinanceModelType.FIVE_JARS,
    nullable: true,
    description:
      'Nullable only for legacy history rows that cannot reconstruct the original model type.',
  })
  modelType!: FinanceModelType | null;
}

class FundAllocationPeriodResponseDto {
  @ApiProperty({ example: 7, minimum: 1, maximum: 12 })
  month!: number;

  @ApiProperty({ example: 2026 })
  year!: number;
}

class FundAllocationItemResponseDto {
  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description:
      'Nullable only for legacy history rows where the original jar reference was removed.',
  })
  jarId!: string | null;

  @ApiProperty({
    example: 'Necessities',
    nullable: true,
    description:
      'Nullable only for legacy history rows without snapshot or current jar data.',
  })
  jarName!: string | null;

  @ApiProperty({
    example: 'NECESSITIES',
    nullable: true,
    description:
      'Nullable only for legacy history rows without snapshot or current jar data.',
  })
  jarCode!: string | null;

  @ApiProperty({
    example: 50,
    nullable: true,
    description:
      'Percent of totalAmount. Nullable only for legacy history rows without snapshot or current jar data.',
  })
  allocationPercentage!: number | null;

  @ApiProperty({
    example: 5000000,
    description:
      'VND được phân loại vào hũ này từ totalAmount; đây không phải tiền mới được cộng vào tổng quỹ gia đình.',
  })
  amount!: number;

  @ApiProperty({
    format: 'uuid',
    description:
      'ID ledger entry audit tương ứng với dòng chia quỹ của hũ này.',
  })
  ledgerEntryId!: string;
}

class FundAllocationEntryJarResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  financeModelId!: string;

  @ApiProperty({ example: 'Necessities' })
  name!: string;

  @ApiProperty({ example: 'NECESSITIES' })
  jarCode!: string;

  @ApiProperty({ example: 50, description: 'Percent of model allocation' })
  allocationPercentage!: number;

  @ApiProperty({
    example: 'Living expenses and household essentials',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({
    example: '2026-07-01T00:00:00.000Z',
    format: 'date-time',
  })
  createdAt!: string;

  @ApiProperty({
    example: '2026-07-01T00:00:00.000Z',
    format: 'date-time',
  })
  updatedAt!: string;
}

class FundAllocationLedgerEntryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  ledgerId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  categoryId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  jarId!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdByMemberId!: string;

  @ApiProperty({
    enum: LedgerEntryType,
    example: LedgerEntryType.ADJUSTMENT,
    description:
      'Luôn là ADJUSTMENT cho thao tác chia quỹ nội bộ theo mô hình tài chính.',
  })
  entryType!: LedgerEntryType;

  @ApiProperty({
    example: 5000000,
    description:
      'VND được ghi để audit việc phân loại vào hũ; không được tính là thu nhập mới.',
  })
  amount!: number;

  @ApiProperty({ example: 'Chia quỹ vào hũ Necessities' })
  description!: string;

  @ApiProperty({ example: 'Chia quỹ tháng 7', nullable: true })
  note!: string | null;

  @ApiProperty({
    example: '2026-07-31T00:00:00.000Z',
    format: 'date-time',
  })
  entryDate!: string;

  @ApiProperty({
    enum: LedgerEntryStatus,
    example: LedgerEntryStatus.ACTIVE,
  })
  status!: LedgerEntryStatus;

  @ApiProperty({
    example: 'MODEL_FUND_ALLOCATION',
    description:
      'Đánh dấu ledger entry phát sinh từ thao tác chia quỹ nội bộ; các báo cáo tổng quỹ không cộng source này như tiền mới.',
  })
  sourceType!: string;

  @ApiProperty({ example: '8ae51f17-14f9-4adc-936b-4f55392cd64e:2026-07' })
  sourceId!: string;

  @ApiProperty({
    example: '2026-07-28T00:00:00.000Z',
    format: 'date-time',
  })
  createdAt!: string;

  @ApiProperty({
    example: '2026-07-28T00:00:00.000Z',
    format: 'date-time',
  })
  updatedAt!: string;

  @ApiProperty({
    type: () => FundAllocationEntryJarResponseDto,
    nullable: true,
    description:
      'Nullable only for legacy history rows where jar data cannot be reconstructed.',
  })
  jar!: FundAllocationEntryJarResponseDto | null;
}

export class FundAllocationDataResponseDto {
  @ApiProperty({ type: () => FundAllocationModelResponseDto })
  model!: FundAllocationModelResponseDto;

  @ApiProperty({ type: () => FundAllocationPeriodResponseDto })
  period!: FundAllocationPeriodResponseDto;

  @ApiProperty({
    example: 10000000,
    description:
      'VND dùng để phân loại vào các hũ. Đây là số tiền hiện có/được người dùng chọn để phân bổ, không làm tăng tổng số dư gia đình.',
  })
  totalAmount!: number;

  @ApiProperty({
    example: '2026-07-28T00:00:00.000Z',
    format: 'date-time',
    description:
      'Timestamp of the allocation group, derived from its ledger entries. FE can use this to sort or display history.',
  })
  createdAt!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Family member who created this fund allocation.',
  })
  createdByMemberId!: string;

  @ApiProperty({ example: 'Chia quỹ tháng 7', nullable: true })
  note!: string | null;

  @ApiProperty({ example: 'MODEL_FUND_ALLOCATION' })
  sourceType!: string;

  @ApiProperty({ example: '8ae51f17-14f9-4adc-936b-4f55392cd64e:2026-07' })
  sourceId!: string;

  @ApiProperty({
    type: () => [FundAllocationItemResponseDto],
    description:
      'Danh sách kết quả chia theo từng hũ. FE nên dùng items để hiển thị kết quả phân bổ. Với dữ liệu có metadata snapshot, tên hũ/mã hũ/tỷ lệ là giá trị tại thời điểm chia quỹ.',
  })
  items!: FundAllocationItemResponseDto[];

  @ApiProperty({
    type: () => [FundAllocationLedgerEntryResponseDto],
    description:
      'Các ledger entry audit đã tạo. Chúng xuất hiện trong lịch sử ledger để truy vết, nhưng sourceType MODEL_FUND_ALLOCATION không được tính như khoản làm tăng tổng quỹ. Lịch sử GET ưu tiên snapshot trong metadata để không bị thay đổi khi cấu hình hũ/mô hình thay đổi sau này.',
  })
  entries!: FundAllocationLedgerEntryResponseDto[];
}

export class FundAllocationApiResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ example: 'Chia quỹ theo mô hình tài chính thành công' })
  message!: string;

  @ApiProperty({ type: () => FundAllocationDataResponseDto })
  data!: FundAllocationDataResponseDto;
}

class FundAllocationListDataResponseDto {
  @ApiProperty({
    type: () => [FundAllocationDataResponseDto],
    description:
      'Danh sách các lần chia quỹ đã được group theo modelId và kỳ month/year.',
  })
  items!: FundAllocationDataResponseDto[];

  @ApiProperty({ example: 1 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;
}

export class FundAllocationListApiResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ example: 'Lấy lịch sử chia quỹ thành công' })
  message!: string;

  @ApiProperty({ type: () => FundAllocationListDataResponseDto })
  data!: FundAllocationListDataResponseDto;
}

export class FundAllocationNotFoundResponseDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({
    example:
      'Không tìm thấy mô hình tài chính đang hoạt động trong gia đình này',
  })
  message!: string;

  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({
    enum: ['NO_ACTIVE_FINANCE_MODEL', 'INVALID_FINANCE_MODEL'],
    example: 'NO_ACTIVE_FINANCE_MODEL',
  })
  code!: string;
}

export class FundAllocationBadRequestResponseDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({
    example: 'Số tiền chia quỹ vượt quá quỹ khả dụng của kỳ này',
  })
  message!: string;

  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({
    enum: [
      'INVALID_FINANCE_MODEL',
      'INVALID_JAR_PERCENTAGE',
      'INSUFFICIENT_AVAILABLE_FUND',
    ],
    example: 'INSUFFICIENT_AVAILABLE_FUND',
  })
  code!: string;
}

export class FundAllocationConflictResponseDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({
    example: 'Ky nay da co lan chia quy',
  })
  message!: string;

  @ApiProperty({ example: 409 })
  statusCode!: number;

  @ApiProperty({
    example: 'FUND_ALLOCATION_ALREADY_EXISTS',
  })
  code!: string;
}

export const FUND_ALLOCATION_RESPONSE_EXAMPLE = {
  success: true,
  message: 'Chia quỹ theo mô hình tài chính thành công',
  data: {
    model: {
      id: '8ae51f17-14f9-4adc-936b-4f55392cd64e',
      name: 'Five Jars',
      modelType: FinanceModelType.FIVE_JARS,
    },
    period: { month: 7, year: 2026 },
    totalAmount: 10000000,
    createdAt: '2026-07-28T00:00:00.000Z',
    createdByMemberId: 'b6bd9e92-2332-4c15-b0cf-40e846922a65',
    note: 'Chia quy thang 7',
    sourceType: 'MODEL_FUND_ALLOCATION',
    sourceId: '8ae51f17-14f9-4adc-936b-4f55392cd64e:2026-07',
    items: [
      {
        jarId: '7c42ec31-cab0-4220-a45e-af9d139f19ef',
        jarName: 'Necessities',
        jarCode: 'NECESSITIES',
        allocationPercentage: 50,
        amount: 5000000,
        ledgerEntryId: '6210493e-9ea9-4714-af58-f8fc0d4d0792',
      },
    ],
    entries: [
      {
        id: '6210493e-9ea9-4714-af58-f8fc0d4d0792',
        ledgerId: 'cc36068d-de50-4b10-84fe-84d987e18f72',
        categoryId: null,
        jarId: '7c42ec31-cab0-4220-a45e-af9d139f19ef',
        createdByMemberId: 'b6bd9e92-2332-4c15-b0cf-40e846922a65',
        entryType: LedgerEntryType.ADJUSTMENT,
        amount: 5000000,
        description: 'Chia quỹ vào hũ Necessities',
        note: 'Chia quỹ tháng 7',
        entryDate: '2026-07-31T00:00:00.000Z',
        status: LedgerEntryStatus.ACTIVE,
        sourceType: 'MODEL_FUND_ALLOCATION',
        sourceId: '8ae51f17-14f9-4adc-936b-4f55392cd64e:2026-07',
        createdAt: '2026-07-28T00:00:00.000Z',
        updatedAt: '2026-07-28T00:00:00.000Z',
        jar: {
          id: '7c42ec31-cab0-4220-a45e-af9d139f19ef',
          financeModelId: '8ae51f17-14f9-4adc-936b-4f55392cd64e',
          name: 'Necessities',
          jarCode: 'NECESSITIES',
          allocationPercentage: 50,
          description: 'Living expenses and household essentials',
          isActive: true,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      },
    ],
  },
} as const;
