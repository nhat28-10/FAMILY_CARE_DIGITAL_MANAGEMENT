import { Injectable } from '@nestjs/common';
import { AiRelatedModule, FamilyRole, LedgerEntryType } from '@prisma/client';

import { FINANCE_MANAGER_ROLES } from '../../finance/controllers/finance-controller.constants';
import { CreateLedgerEntryDto } from '../../finance/dto/create-ledger-entry.dto';
import type { FinancialGoalQueryDto } from '../../finance/dto/financial-goal-query.dto';
import type { LedgerEntryQueryDto } from '../../finance/dto/ledger-entry-query.dto';
import { FinanceService } from '../../finance/services/finance.service';
import { FinancialGoalService } from '../../finance/services/financial-goal.service';
import { AiActionType } from '../types/ai-chatbot.types';
import type { AiToolDefinition, AiToolProvider } from './tool.types';
import { validateActionArgs } from './validate-action-args';

const ALL_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
  FamilyRole.FAMILY_MEMBER,
];

const MAX_LIST_LIMIT = 20;

const periodProperties = {
  month: {
    type: 'integer',
    minimum: 1,
    maximum: 12,
    description: 'Tháng cần xem (mặc định tháng hiện tại)',
  },
  year: {
    type: 'integer',
    minimum: 1900,
    maximum: 9999,
    description: 'Năm cần xem (mặc định năm hiện tại)',
  },
};

function clampLimit(value: unknown): number {
  const parsed = typeof value === 'number' ? Math.floor(value) : NaN;
  if (Number.isNaN(parsed) || parsed < 1) return MAX_LIST_LIMIT;
  return Math.min(parsed, MAX_LIST_LIMIT);
}

function intOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' ? Math.floor(value) : undefined;
}

@Injectable()
export class FinanceAiTools implements AiToolProvider {
  constructor(
    private readonly financeService: FinanceService,
    private readonly financialGoalService: FinancialGoalService,
  ) {}

  getTools(): AiToolDefinition[] {
    return [
      {
        name: 'get_finance_overview',
        description:
          'Tổng quan tài chính gia đình theo tháng: tổng thu, tổng chi, số dư sổ chung. Dùng khi hỏi "tháng này tiêu bao nhiêu / thu chi thế nào".',
        parameters: {
          type: 'object',
          properties: periodProperties,
          additionalProperties: false,
        },
        module: AiRelatedModule.FINANCE,
        kind: 'read',
        allowedRoles: [...FINANCE_MANAGER_ROLES],
        execute: (args, ctx) =>
          this.financeService.getOverview(ctx.familyId, ctx.memberId, {
            month: intOrUndefined(args.month),
            year: intOrUndefined(args.year),
          }),
      },
      {
        name: 'list_recent_ledger_entries',
        description:
          'Danh sách giao dịch gần đây trong sổ tài chính chung của gia đình (có lọc theo tháng/năm).',
        parameters: {
          type: 'object',
          properties: {
            ...periodProperties,
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: MAX_LIST_LIMIT,
              description: 'Số giao dịch muốn lấy (tối đa 20)',
            },
          },
          additionalProperties: false,
        },
        module: AiRelatedModule.FINANCE,
        kind: 'read',
        allowedRoles: [...FINANCE_MANAGER_ROLES],
        execute: (args, ctx) =>
          this.financeService.listLedgerEntries(ctx.familyId, {
            page: 1,
            limit: clampLimit(args.limit),
            month: intOrUndefined(args.month),
            year: intOrUndefined(args.year),
          }),
      },
      {
        name: 'list_finance_jars',
        description:
          'Danh sách hũ tài chính (jar) của gia đình kèm phần trăm phân bổ — dùng khi hỏi về mô hình hũ/jar.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        module: AiRelatedModule.FINANCE,
        kind: 'read',
        allowedRoles: ALL_ROLES,
        execute: (_args, ctx) =>
          this.financeService.listFinanceJars(ctx.familyId, ctx.familyRole),
      },
      {
        name: 'list_finance_categories',
        description:
          'Danh sách danh mục thu chi của gia đình (kèm id) — dùng để tra categoryId trước khi đề xuất tạo giao dịch.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        module: AiRelatedModule.FINANCE,
        kind: 'read',
        allowedRoles: ALL_ROLES,
        execute: async (_args, ctx) => {
          const categories = await this.financeService.listCategories(
            ctx.familyId,
          );
          // Trả mảng rỗng dễ khiến model hiểu nhầm là "lỗi/không lấy được" rồi
          // từ chối. Kèm note nói rõ danh mục là tùy chọn để model cứ đề xuất.
          return {
            count: categories.length,
            categories,
            note:
              categories.length === 0
                ? 'Gia đình chưa thiết lập danh mục nào. Danh mục là TÙY CHỌN — hãy tiếp tục tạo đề xuất giao dịch mà không cần categoryId.'
                : undefined,
          };
        },
      },
      {
        name: 'list_financial_goals',
        description:
          'Danh sách mục tiêu tài chính của gia đình kèm tiến độ tích lũy — dùng khi hỏi về mục tiêu tiết kiệm.',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: MAX_LIST_LIMIT,
              description: 'Số mục tiêu muốn lấy (tối đa 20)',
            },
          },
          additionalProperties: false,
        },
        module: AiRelatedModule.FINANCE,
        kind: 'read',
        allowedRoles: ALL_ROLES,
        execute: (args, ctx) =>
          this.financialGoalService.listFinancialGoals(
            ctx.familyId,
            ctx.memberId,
            {
              page: 1,
              limit: clampLimit(args.limit),
              includeProgress: true,
            },
          ),
      },
      {
        name: 'get_member_monthly_summary',
        description:
          'Tóm tắt tài chính tháng của CHÍNH người đang hỏi: thu nhập, ngân sách cá nhân, đóng góp vào sổ chung.',
        parameters: {
          type: 'object',
          properties: {
            month: { ...periodProperties.month, description: 'Tháng cần xem' },
            year: { ...periodProperties.year, description: 'Năm cần xem' },
          },
          required: ['month', 'year'],
          additionalProperties: false,
        },
        module: AiRelatedModule.FINANCE,
        kind: 'read',
        allowedRoles: ALL_ROLES,
        execute: (args, ctx) =>
          this.financeService.getMyMonthlySummary(ctx.familyId, ctx.memberId, {
            month: intOrUndefined(args.month) ?? new Date().getMonth() + 1,
            year: intOrUndefined(args.year) ?? new Date().getFullYear(),
          }),
      },
      {
        name: 'propose_create_ledger_entry',
        description:
          'ĐỀ XUẤT tạo một giao dịch thu/chi trong sổ tài chính chung (người dùng phải bấm xác nhận mới ghi sổ). Dùng khi người dùng nhờ ghi chép khoản thu/chi — hãy GỌI TOOL NÀY NGAY. categoryId/jarId là tùy chọn: chỉ tra list_finance_categories khi người dùng nêu rõ một danh mục cụ thể; nếu không thì cứ đề xuất mà bỏ trống, đừng chặn lại vì thiếu danh mục.',
        parameters: {
          type: 'object',
          properties: {
            entryType: {
              type: 'string',
              enum: Object.values(LedgerEntryType),
              description: 'Loại giao dịch (INCOME = thu, EXPENSE = chi...)',
            },
            amount: {
              type: 'number',
              exclusiveMinimum: 0,
              description: 'Số tiền (VND), lớn hơn 0',
            },
            description: {
              type: 'string',
              maxLength: 500,
              description: 'Mô tả ngắn của giao dịch',
            },
            note: { type: 'string', maxLength: 1000 },
            entryDate: {
              type: 'string',
              description:
                'Ngày giao dịch dạng ISO 8601 (mặc định hôm nay nếu người dùng không nói)',
            },
            categoryId: {
              type: 'string',
              description: 'UUID danh mục lấy từ list_finance_categories',
            },
            jarId: { type: 'string', description: 'UUID hũ tài chính nếu có' },
          },
          required: ['entryType', 'amount', 'description', 'entryDate'],
          additionalProperties: false,
        },
        module: AiRelatedModule.FINANCE,
        kind: 'write',
        allowedRoles: [...FINANCE_MANAGER_ROLES],
        actionType: AiActionType.CREATE_LEDGER_ENTRY,
        buildActionPayload: (args) => {
          const dto = validateActionArgs(CreateLedgerEntryDto, args);
          return Promise.resolve({ ...dto });
        },
      },
    ];
  }
}
