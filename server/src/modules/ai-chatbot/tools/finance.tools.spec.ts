import { FamilyRole, LedgerEntryType } from '@prisma/client';

import type { FinanceService } from '../../finance/services/finance.service';
import type { FinancialGoalService } from '../../finance/services/financial-goal.service';
import { FinanceAiTools } from './finance.tools';

describe('FinanceAiTools write proposals', () => {
  let tools: FinanceAiTools;
  let financeService: jest.Mocked<
    Pick<FinanceService, 'listMemberMonthlyFinances'>
  >;
  let financialGoalService: jest.Mocked<
    Pick<FinancialGoalService, 'getGoalContributionSuggestions'>
  >;

  beforeEach(() => {
    financeService = {
      listMemberMonthlyFinances: jest.fn(),
    };
    financialGoalService = {
      getGoalContributionSuggestions: jest.fn(),
    };
    tools = new FinanceAiTools(
      financeService as unknown as FinanceService,
      financialGoalService as unknown as FinancialGoalService,
    );
  });

  const ledgerTool = () => {
    const tool = tools
      .getTools()
      .find((item) => item.name === 'propose_create_ledger_entry');
    if (!tool?.buildActionPayload) {
      throw new Error('propose_create_ledger_entry not found');
    }
    return tool;
  };
  const goalContributionSuggestionTool = () => {
    const tool = tools
      .getTools()
      .find((item) => item.name === 'get_goal_contribution_suggestions');
    if (!tool?.execute) {
      throw new Error('get_goal_contribution_suggestions not found');
    }
    return tool;
  };
  const goalContributionPlanTool = () => {
    const tool = tools
      .getTools()
      .find((item) => item.name === 'propose_create_goal_contribution_plan');
    if (!tool?.buildActionPayload) {
      throw new Error('propose_create_goal_contribution_plan not found');
    }
    return tool;
  };
  const memberMonthlyFinancesTool = () => {
    const tool = tools
      .getTools()
      .find((item) => item.name === 'list_member_monthly_finances');
    if (!tool?.execute) {
      throw new Error('list_member_monthly_finances not found');
    }
    return tool;
  };

  it('normalizes ledger entry date-only args before DTO validation', async () => {
    const payload = await ledgerTool().buildActionPayload!(
      {
        entryType: LedgerEntryType.EXPENSE,
        amount: 45000,
        description: 'Tiền cà phê',
        entryDate: '2026-08-09',
      },
      {
        familyId: 'family-1',
        memberId: 'member-1',
        familyRole: FamilyRole.FAMILY_MANAGER,
      },
    );

    expect(payload.entryDate).toBe('2026-08-09T00:00:00+07:00');
  });

  it('adds seconds and Vietnam timezone for local ledger datetimes', async () => {
    const payload = await ledgerTool().buildActionPayload!(
      {
        entryType: LedgerEntryType.EXPENSE,
        amount: 85000,
        description: 'Tiền ăn',
        entryDate: '2026-08-09T08:30',
      },
      {
        familyId: 'family-1',
        memberId: 'member-1',
        familyRole: FamilyRole.FAMILY_MANAGER,
      },
    );

    expect(payload.entryDate).toBe('2026-08-09T08:30:00+07:00');
  });

  it('falls back to current Vietnam datetime when model sends natural language', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-09T03:04:05.000Z'));

    try {
      const payload = await ledgerTool().buildActionPayload!(
        {
          entryType: LedgerEntryType.EXPENSE,
          amount: 250000,
          description: 'Sửa xe',
          entryDate: 'ngay bây giờ',
        },
        {
          familyId: 'family-1',
          memberId: 'member-1',
          familyRole: FamilyRole.FAMILY_MANAGER,
        },
      );

      expect(payload.entryDate).toBe('2026-08-09T10:04:05+07:00');
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps current Vietnam time when user asks for ngay bay gio and model sends date-only', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-09T03:04:05.000Z'));

    try {
      const payload = await ledgerTool().buildActionPayload!(
        {
          entryType: LedgerEntryType.EXPENSE,
          amount: 20000,
          description: 'Tien nuoc',
          entryDate: '2026-08-09',
        },
        {
          familyId: 'family-1',
          memberId: 'member-1',
          familyRole: FamilyRole.FAMILY_MANAGER,
          userContent: 'Ghi khoan chi 20.000d tien nuoc ngay bay gio',
          now: new Date(),
        },
      );

      expect(payload.entryDate).toBe('2026-08-09T10:04:05+07:00');
    } finally {
      jest.useRealTimers();
    }
  });

  it('exposes goal contribution suggestions as a read tool', async () => {
    financialGoalService.getGoalContributionSuggestions.mockResolvedValue({
      goalId: '00000000-0000-4000-8000-000000000001',
      periodMonth: 9,
      periodYear: 2026,
      monthlyContributionTarget: 4000000,
      totalAvailableAmount: 12000000,
      suggestions: [],
    });

    await goalContributionSuggestionTool().execute!(
      {
        goalId: '00000000-0000-4000-8000-000000000001',
        month: 9,
        year: 2026,
      },
      {
        familyId: 'family-1',
        memberId: 'member-1',
        familyRole: FamilyRole.FAMILY_MANAGER,
      },
    );

    expect(
      financialGoalService.getGoalContributionSuggestions,
    ).toHaveBeenCalledWith(
      'family-1',
      'member-1',
      '00000000-0000-4000-8000-000000000001',
      { month: 9, year: 2026 },
    );
  });

  it('exposes member monthly finances as a manager read tool', async () => {
    financeService.listMemberMonthlyFinances.mockResolvedValue({
      period: { month: 9, year: 2026 },
      scope: 'FAMILY_ACTIVE_MEMBERS',
      members: [],
      note: 'ok',
    });

    await memberMonthlyFinancesTool().execute!(
      { month: 9, year: 2026 },
      {
        familyId: 'family-1',
        memberId: 'member-manager',
        familyRole: FamilyRole.FAMILY_MANAGER,
      },
    );

    expect(financeService.listMemberMonthlyFinances).toHaveBeenCalledWith(
      'family-1',
      'member-manager',
      { month: 9, year: 2026 },
    );
    expect(memberMonthlyFinancesTool().allowedRoles).toEqual([
      FamilyRole.FAMILY_MANAGER,
      FamilyRole.DEPUTY_MEMBER,
    ]);
  });

  it('uses DB contribution suggestions instead of model-supplied member amounts', async () => {
    financialGoalService.getGoalContributionSuggestions.mockResolvedValue({
      goalId: '00000000-0000-4000-8000-000000000001',
      periodMonth: 9,
      periodYear: 2026,
      monthlyContributionTarget: 4000000,
      totalAvailableAmount: 12000000,
      suggestions: [
        {
          memberId: '00000000-0000-4000-8000-000000000011',
          displayName: 'Lê Anh Sỹ',
          incomeAmount: 15000000,
          personalExpenseAmount: 5000000,
          sharedContributionAmount: 0,
          incomeSource: 'ACTUAL',
          expenseSource: 'ACTUAL',
          sharedContributionSource: 'MISSING',
          availableAmount: 10000000,
          suggestedContribution: 3333333,
        },
        {
          memberId: '00000000-0000-4000-8000-000000000012',
          displayName: 'Minh Nhut',
          incomeAmount: 3000000,
          personalExpenseAmount: 1000000,
          sharedContributionAmount: 0,
          incomeSource: 'ACTUAL',
          expenseSource: 'ACTUAL',
          sharedContributionSource: 'MISSING',
          availableAmount: 2000000,
          suggestedContribution: 666667,
        },
      ],
    });

    const payload = await goalContributionPlanTool().buildActionPayload!(
      {
        goalId: '00000000-0000-4000-8000-000000000001',
        contributionPlan: {
          periodMonth: 9,
          periodYear: 2026,
          dueDate: '2026-09-25',
          members: [
            {
              memberId: '00000000-0000-4000-8000-000000000011',
              plannedAmount: 5000000,
            },
            {
              memberId: '00000000-0000-4000-8000-000000000012',
              plannedAmount: 5000000,
            },
          ],
        },
      },
      {
        familyId: 'family-1',
        memberId: 'member-1',
        familyRole: FamilyRole.FAMILY_MANAGER,
      },
    );

    expect(payload.contributionPlan).toMatchObject({
      members: [
        {
          memberId: '00000000-0000-4000-8000-000000000011',
          plannedAmount: 3333333,
        },
        {
          memberId: '00000000-0000-4000-8000-000000000012',
          plannedAmount: 666667,
        },
      ],
    });
    expect(payload.contributionBasis).toMatchObject({
      monthlyContributionTarget: 4000000,
      members: [
        expect.objectContaining({
          displayName: 'Lê Anh Sỹ',
          incomeAmount: 15000000,
          availableAmount: 10000000,
        }),
        expect.objectContaining({
          displayName: 'Minh Nhut',
          incomeAmount: 3000000,
          availableAmount: 2000000,
        }),
      ],
    });
  });
});
