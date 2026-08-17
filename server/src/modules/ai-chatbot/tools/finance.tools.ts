import { Injectable } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDefined, IsUUID, ValidateNested } from 'class-validator';
import {
  AiRelatedModule,
  BudgetPlanStatus,
  BudgetPeriodType,
  EssentialType,
  FamilyRole,
  LedgerEntryType,
} from '@prisma/client';

import { FINANCE_MANAGER_ROLES } from '../../finance/controllers/finance-controller.constants';
import { ConfirmGoalContributionPlanDto } from '../../finance/dto/confirm-goal-contribution-plan.dto';
import { CreateBudgetLineDto } from '../../finance/dto/create-budget-line.dto';
import { CreateBudgetPlanDto } from '../../finance/dto/create-budget-plan.dto';
import { CreateFinancialGoalDto } from '../../finance/dto/create-financial-goal.dto';
import { CreateFundAllocationDto } from '../../finance/dto/create-fund-allocation.dto';
import { CreateGoalAllocationDto } from '../../finance/dto/create-goal-allocation.dto';
import { CreateLedgerEntryDto } from '../../finance/dto/create-ledger-entry.dto';
import { FinanceService } from '../../finance/services/finance.service';
import { FinancialGoalService } from '../../finance/services/financial-goal.service';
import { AiActionType } from '../types/ai-chatbot.types';
import type { AiToolDefinition, AiToolProvider } from './tool.types';
import { validateActionArgs } from './validate-action-args';
import { normalizeVietnamDateTimeForText } from './vietnam-date-time.util';

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

function normalizeLedgerEntryArgs(
  args: Record<string, unknown>,
  userContent?: string,
  now = new Date(),
): Record<string, unknown> {
  return {
    ...args,
    entryDate: normalizeVietnamDateTimeForText(
      args.entryDate,
      userContent,
      now,
    ),
  };
}

class ProposeCreateBudgetLineDto {
  @IsUUID()
  budgetPlanId!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => CreateBudgetLineDto)
  line!: CreateBudgetLineDto;
}

class ProposeCreateGoalAllocationDto {
  @IsUUID()
  goalId!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => CreateGoalAllocationDto)
  allocation!: CreateGoalAllocationDto;
}

class ProposeGoalContributionPlanDto {
  @IsUUID()
  goalId!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => ConfirmGoalContributionPlanDto)
  contributionPlan!: ConfirmGoalContributionPlanDto;
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
        name: 'list_budget_plans',
        description:
          'Danh sách kế hoạch ngân sách của gia đình. Dùng để tìm budgetPlanId trước khi đề xuất thêm dòng ngân sách, hoặc khi người dùng hỏi về ngân sách hiện có.',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: Object.values(BudgetPlanStatus),
              description: 'Lọc theo trạng thái kế hoạch ngân sách',
            },
            periodType: {
              type: 'string',
              enum: Object.values(BudgetPeriodType),
              description: 'Lọc theo loại kỳ ngân sách',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: MAX_LIST_LIMIT,
              description: 'Số kế hoạch muốn lấy (tối đa 20)',
            },
          },
          additionalProperties: false,
        },
        module: AiRelatedModule.FINANCE,
        kind: 'read',
        allowedRoles: [...FINANCE_MANAGER_ROLES],
        execute: (args, ctx) =>
          this.financeService.listBudgetPlans(ctx.familyId, {
            page: 1,
            limit: clampLimit(args.limit),
            status:
              typeof args.status === 'string'
                ? (args.status as BudgetPlanStatus)
                : undefined,
            periodType:
              typeof args.periodType === 'string'
                ? (args.periodType as BudgetPeriodType)
                : undefined,
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
        name: 'get_goal_contribution_suggestions',
        description:
          'Lấy gợi ý đóng góp mục tiêu theo từng thành viên từ dữ liệu tài chính tháng. Dùng khi hỏi ai nên góp bao nhiêu, hoặc trước khi lập kế hoạch đóng góp mục tiêu. Kết quả có incomeAmount, personalExpenseAmount, sharedContributionAmount, availableAmount và suggestedContribution; không tự bịa số nếu tool không trả dữ liệu.',
        parameters: {
          type: 'object',
          properties: {
            goalId: {
              type: 'string',
              description: 'UUID mục tiêu tài chính',
            },
            month: { ...periodProperties.month, description: 'Tháng cần tính' },
            year: { ...periodProperties.year, description: 'Năm cần tính' },
          },
          required: ['goalId', 'month', 'year'],
          additionalProperties: false,
        },
        module: AiRelatedModule.FINANCE,
        kind: 'read',
        allowedRoles: ALL_ROLES,
        execute: (args, ctx) =>
          this.financialGoalService.getGoalContributionSuggestions(
            ctx.familyId,
            ctx.memberId,
            String(args.goalId),
            {
              month: intOrUndefined(args.month) ?? new Date().getMonth() + 1,
              year: intOrUndefined(args.year) ?? new Date().getFullYear(),
            },
          ),
      },
      {
        name: 'list_member_monthly_finances',
        description:
          'Danh sách thu nhập/chi tiêu thực tế và dự kiến theo tháng của từng thành viên active trong gia đình. Dùng cho câu hỏi như "list thu chi thực tế của từng thành viên", "mỗi thành viên thu nhập/chi tiêu bao nhiêu". Manager/deputy xem được danh sách thành viên; các trường private sẽ là null theo visibility, không được nói là không có quyền nếu tool trả dữ liệu.',
        parameters: {
          type: 'object',
          properties: {
            month: {
              ...periodProperties.month,
              description: 'Tháng cần xem, mặc định tháng hiện tại',
            },
            year: {
              ...periodProperties.year,
              description: 'Năm cần xem, mặc định năm hiện tại',
            },
          },
          additionalProperties: false,
        },
        module: AiRelatedModule.FINANCE,
        kind: 'read',
        allowedRoles: [...FINANCE_MANAGER_ROLES],
        execute: (args, ctx) =>
          this.financeService.listMemberMonthlyFinances(
            ctx.familyId,
            ctx.memberId,
            {
              month: intOrUndefined(args.month) ?? new Date().getMonth() + 1,
              year: intOrUndefined(args.year) ?? new Date().getFullYear(),
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
          'ĐỀ XUẤT tạo một giao dịch thu/chi trong sổ tài chính chung (người dùng phải bấm xác nhận mới ghi sổ). Dùng khi người dùng nhờ ghi chép khoản thu/chi. Nên tra list_finance_categories trước để chọn categoryId nếu mô tả khoản thu/chi khớp rõ với một danh mục; nếu không khớp rõ thì vẫn tạo đề xuất và bỏ trống categoryId/jarId, đừng chặn lại vì thiếu danh mục.',
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
                'Ngày giao dịch dạng ISO 8601 có timezone, ví dụ 2026-06-10T15:30:00+07:00. Nếu người dùng nói hôm nay/tuần này, quy đổi theo múi giờ Việt Nam.',
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
        buildActionPayload: (args, ctx) => {
          const dto = validateActionArgs(
            CreateLedgerEntryDto,
            normalizeLedgerEntryArgs(
              args,
              ctx.conversationText ?? ctx.userContent,
              ctx.now,
            ),
          );
          return Promise.resolve({ ...dto });
        },
      },
      {
        name: 'propose_create_budget_plan',
        description:
          'ĐỀ XUẤT tạo kế hoạch ngân sách gia đình ở trạng thái DRAFT (người dùng phải bấm xác nhận mới tạo). Dùng khi người dùng muốn lập ngân sách tháng/kỳ mới. Có thể kèm lines nếu đã biết categoryId hoặc jarId; nếu chưa có id phù hợp, vẫn tạo kế hoạch không có lines và giải thích FE/user có thể bổ sung sau.',
        parameters: {
          type: 'object',
          properties: {
            planName: {
              type: 'string',
              maxLength: 150,
              description: 'Tên kế hoạch ngân sách',
            },
            periodType: {
              type: 'string',
              enum: Object.values(BudgetPeriodType),
              description: 'Loại kỳ ngân sách',
            },
            periodStart: {
              type: 'string',
              description: 'Ngày bắt đầu kỳ ngân sách dạng YYYY-MM-DD',
            },
            periodEnd: {
              type: 'string',
              description: 'Ngày kết thúc kỳ ngân sách dạng YYYY-MM-DD',
            },
            expectedSharedIncome: {
              type: 'number',
              minimum: 0,
              description: 'Thu nhập/quỹ chung dự kiến',
            },
            expectedSharedExpense: {
              type: 'number',
              minimum: 0,
              description: 'Chi tiêu chung dự kiến',
            },
            lines: {
              type: 'array',
              maxItems: 10,
              description:
                'Các dòng ngân sách tùy chọn. Mỗi dòng cần categoryId hoặc jarId nếu muốn tạo ngay.',
              items: {
                type: 'object',
                properties: {
                  categoryId: {
                    type: 'string',
                    description: 'UUID danh mục tài chính',
                  },
                  jarId: {
                    type: 'string',
                    description: 'UUID hũ tài chính',
                  },
                  plannedAmount: {
                    type: 'number',
                    minimum: 0,
                    description: 'Số tiền kế hoạch',
                  },
                  thresholdAmount: {
                    type: 'number',
                    minimum: 0,
                    description: 'Ngưỡng cảnh báo theo số tiền',
                  },
                  thresholdPercent: {
                    type: 'number',
                    minimum: 0,
                    maximum: 100,
                    description: 'Ngưỡng cảnh báo theo phần trăm',
                  },
                  essentialType: {
                    type: 'string',
                    enum: Object.values(EssentialType),
                    description: 'Mức thiết yếu của dòng ngân sách',
                  },
                  note: {
                    type: 'string',
                    maxLength: 1000,
                  },
                },
                required: ['plannedAmount'],
                additionalProperties: false,
              },
            },
          },
          required: ['planName', 'periodType', 'periodStart', 'periodEnd'],
          additionalProperties: false,
        },
        module: AiRelatedModule.FINANCE,
        kind: 'write',
        allowedRoles: [...FINANCE_MANAGER_ROLES],
        actionType: AiActionType.CREATE_BUDGET_PLAN,
        buildActionPayload: (args) => {
          const dto = validateActionArgs(CreateBudgetPlanDto, args);
          return Promise.resolve({ ...dto });
        },
      },
      {
        name: 'propose_create_financial_goal',
        description:
          'ĐỀ XUẤT tạo mục tiêu tài chính/tiết kiệm cho gia đình (người dùng phải bấm xác nhận mới tạo). Dùng khi người dùng nói muốn tiết kiệm/mua/đạt một khoản tiền trước hạn nào đó.',
        parameters: {
          type: 'object',
          properties: {
            goalName: {
              type: 'string',
              maxLength: 150,
              description: 'Tên mục tiêu tài chính',
            },
            targetAmount: {
              type: 'number',
              exclusiveMinimum: 0,
              description: 'Số tiền mục tiêu VND',
            },
            deadline: {
              type: 'string',
              description: 'Hạn mục tiêu dạng YYYY-MM-DD nếu có',
            },
            monthlyContributionTarget: {
              type: 'number',
              minimum: 0,
              description: 'Số tiền nên đóng góp mỗi tháng nếu có',
            },
            relatedJarId: {
              type: 'string',
              description: 'UUID hũ tài chính liên quan nếu có',
            },
          },
          required: ['goalName', 'targetAmount'],
          additionalProperties: false,
        },
        module: AiRelatedModule.FINANCE,
        kind: 'write',
        allowedRoles: [...FINANCE_MANAGER_ROLES],
        actionType: AiActionType.CREATE_FINANCIAL_GOAL,
        buildActionPayload: (args) => {
          const dto = validateActionArgs(CreateFinancialGoalDto, args);
          return Promise.resolve({ ...dto });
        },
      },
      {
        name: 'propose_create_budget_line',
        description:
          'ĐỀ XUẤT thêm một dòng ngân sách vào budget plan đang DRAFT (người dùng phải xác nhận mới tạo). Trước đó nên dùng list_budget_plans để lấy budgetPlanId và list_finance_categories/list_finance_jars để lấy categoryId hoặc jarId.',
        parameters: {
          type: 'object',
          properties: {
            budgetPlanId: {
              type: 'string',
              description: 'UUID kế hoạch ngân sách cần thêm dòng',
            },
            line: {
              type: 'object',
              properties: {
                categoryId: {
                  type: 'string',
                  description: 'UUID danh mục tài chính',
                },
                jarId: {
                  type: 'string',
                  description: 'UUID hũ tài chính',
                },
                plannedAmount: {
                  type: 'number',
                  minimum: 0,
                  description: 'Số tiền kế hoạch',
                },
                thresholdAmount: {
                  type: 'number',
                  minimum: 0,
                  description: 'Ngưỡng cảnh báo theo số tiền',
                },
                thresholdPercent: {
                  type: 'number',
                  minimum: 0,
                  maximum: 100,
                  description: 'Ngưỡng cảnh báo theo phần trăm',
                },
                essentialType: {
                  type: 'string',
                  enum: Object.values(EssentialType),
                  description: 'Mức thiết yếu của dòng ngân sách',
                },
                note: { type: 'string', maxLength: 1000 },
              },
              required: ['plannedAmount'],
              additionalProperties: false,
            },
          },
          required: ['budgetPlanId', 'line'],
          additionalProperties: false,
        },
        module: AiRelatedModule.FINANCE,
        kind: 'write',
        allowedRoles: [...FINANCE_MANAGER_ROLES],
        actionType: AiActionType.CREATE_BUDGET_LINE,
        buildActionPayload: (args) => {
          const dto = validateActionArgs(ProposeCreateBudgetLineDto, args);
          return Promise.resolve({
            budgetPlanId: dto.budgetPlanId,
            line: { ...dto.line },
          });
        },
      },
      {
        name: 'propose_create_goal_allocation',
        description:
          'ĐỀ XUẤT phân bổ tiền vào một mục tiêu tài chính (người dùng phải xác nhận mới tạo). Nếu không có ledgerEntryId, backend sẽ tạo một giao dịch đóng góp cho mục tiêu.',
        parameters: {
          type: 'object',
          properties: {
            goalId: {
              type: 'string',
              description: 'UUID mục tiêu tài chính',
            },
            allocation: {
              type: 'object',
              properties: {
                ledgerEntryId: {
                  type: 'string',
                  description:
                    'UUID giao dịch hiện có. Có thể bỏ trống để backend tạo giao dịch đóng góp mới.',
                },
                amount: {
                  type: 'number',
                  exclusiveMinimum: 0,
                  description: 'Số tiền phân bổ vào mục tiêu',
                },
              },
              required: ['amount'],
              additionalProperties: false,
            },
          },
          required: ['goalId', 'allocation'],
          additionalProperties: false,
        },
        module: AiRelatedModule.FINANCE,
        kind: 'write',
        allowedRoles: ALL_ROLES,
        actionType: AiActionType.CREATE_GOAL_ALLOCATION,
        buildActionPayload: (args) => {
          const dto = validateActionArgs(ProposeCreateGoalAllocationDto, args);
          return Promise.resolve({
            goalId: dto.goalId,
            allocation: { ...dto.allocation },
          });
        },
      },
      {
        name: 'propose_create_goal_contribution_plan',
        description:
          'ĐỀ XUẤT lập kế hoạch đóng góp theo tháng cho một mục tiêu tài chính, gồm danh sách thành viên và số tiền dự kiến. Nếu người dùng không chỉ định rõ số tiền của từng thành viên, phải dựa trên get_goal_contribution_suggestions và dùng suggestedContribution. Chỉ manager/deputy được xác nhận.',
        parameters: {
          type: 'object',
          properties: {
            goalId: {
              type: 'string',
              description: 'UUID mục tiêu tài chính',
            },
            contributionPlan: {
              type: 'object',
              properties: {
                periodMonth: {
                  type: 'integer',
                  minimum: 1,
                  maximum: 12,
                },
                periodYear: {
                  type: 'integer',
                  minimum: 1900,
                  maximum: 9999,
                },
                dueDate: {
                  type: 'string',
                  description: 'Hạn đóng góp dạng YYYY-MM-DD',
                },
                members: {
                  type: 'array',
                  minItems: 1,
                  items: {
                    type: 'object',
                    properties: {
                      memberId: {
                        type: 'string',
                        description: 'UUID thành viên đóng góp',
                      },
                      plannedAmount: {
                        type: 'number',
                        minimum: 0,
                      },
                    },
                    required: ['memberId', 'plannedAmount'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['periodMonth', 'periodYear', 'dueDate', 'members'],
              additionalProperties: false,
            },
          },
          required: ['goalId', 'contributionPlan'],
          additionalProperties: false,
        },
        module: AiRelatedModule.FINANCE,
        kind: 'write',
        allowedRoles: [...FINANCE_MANAGER_ROLES],
        actionType: AiActionType.CREATE_GOAL_CONTRIBUTION_PLAN,
        buildActionPayload: async (args, ctx) => {
          const dto = validateActionArgs(ProposeGoalContributionPlanDto, args);
          const suggestions =
            await this.financialGoalService.getGoalContributionSuggestions(
              ctx.familyId,
              ctx.memberId,
              dto.goalId,
              {
                month: dto.contributionPlan.periodMonth,
                year: dto.contributionPlan.periodYear,
              },
            );
          const suggestedMembers = suggestions.suggestions
            .filter((item) => item.suggestedContribution > 0)
            .map((item) => ({
              memberId: item.memberId,
              plannedAmount: item.suggestedContribution,
            }));
          const members =
            suggestedMembers.length > 0
              ? suggestedMembers
              : dto.contributionPlan.members;
          const suggestionsByMember = new Map(
            suggestions.suggestions.map((item) => [item.memberId, item]),
          );
          return {
            goalId: dto.goalId,
            contributionPlan: { ...dto.contributionPlan, members },
            contributionBasis: {
              formula:
                'availableAmount = incomeAmount - personalExpenseAmount - sharedContributionAmount; suggestedContribution = monthlyContributionTarget * availableAmount / totalAvailableAmount',
              amountPriority:
                'Ưu tiên số thực tế actual*, nếu chưa có thì dùng số dự kiến expected*.',
              monthlyContributionTarget: suggestions.monthlyContributionTarget,
              totalAvailableAmount: suggestions.totalAvailableAmount,
              members: members.map((memberPlan) => {
                const suggestion = suggestionsByMember.get(memberPlan.memberId);
                return {
                  memberId: memberPlan.memberId,
                  displayName: suggestion?.displayName,
                  plannedAmount: memberPlan.plannedAmount,
                  incomeAmount: suggestion?.incomeAmount ?? null,
                  personalExpenseAmount:
                    suggestion?.personalExpenseAmount ?? null,
                  sharedContributionAmount:
                    suggestion?.sharedContributionAmount ?? null,
                  availableAmount: suggestion?.availableAmount ?? null,
                  suggestedContribution:
                    suggestion?.suggestedContribution ?? null,
                  incomeSource: suggestion?.incomeSource,
                  expenseSource: suggestion?.expenseSource,
                  sharedContributionSource:
                    suggestion?.sharedContributionSource,
                  source: suggestion
                    ? 'GOAL_CONTRIBUTION_SUGGESTIONS'
                    : 'MANUAL_OR_UNAVAILABLE',
                };
              }),
              note: 'Các số tiền đề xuất được lấy từ dữ liệu tài chính tháng mà người hỏi được phép xem. Thành viên thiếu dữ liệu hoặc ẩn thu/chi sẽ không có số gợi ý.',
            },
          };
        },
      },
      {
        name: 'propose_allocate_fund_by_model',
        description:
          'ĐỀ XUẤT chia quỹ gia đình theo mô hình hũ tài chính đang active hoặc modelId chỉ định. Người dùng phải xác nhận mới tạo các giao dịch phân bổ.',
        parameters: {
          type: 'object',
          properties: {
            modelId: {
              type: 'string',
              description:
                'UUID mô hình tài chính. Có thể bỏ trống để dùng mô hình active.',
            },
            amount: {
              type: 'number',
              exclusiveMinimum: 0,
              description: 'Tổng số tiền cần chia quỹ',
            },
            periodMonth: {
              type: 'integer',
              minimum: 1,
              maximum: 12,
            },
            periodYear: {
              type: 'integer',
              minimum: 1900,
              maximum: 9999,
            },
            note: { type: 'string', maxLength: 1000 },
          },
          required: ['amount', 'periodMonth', 'periodYear'],
          additionalProperties: false,
        },
        module: AiRelatedModule.FINANCE,
        kind: 'write',
        allowedRoles: [...FINANCE_MANAGER_ROLES],
        actionType: AiActionType.ALLOCATE_FUND_BY_MODEL,
        buildActionPayload: (args) => {
          const dto = validateActionArgs(CreateFundAllocationDto, args);
          return Promise.resolve({ ...dto });
        },
      },
    ];
  }
}
