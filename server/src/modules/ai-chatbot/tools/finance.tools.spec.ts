import { FamilyRole, LedgerEntryType } from '@prisma/client';

import type { FinanceService } from '../../finance/services/finance.service';
import type { FinancialGoalService } from '../../finance/services/financial-goal.service';
import { FinanceAiTools } from './finance.tools';

describe('FinanceAiTools write proposals', () => {
  let tools: FinanceAiTools;

  beforeEach(() => {
    tools = new FinanceAiTools(
      {} as FinanceService,
      {} as FinancialGoalService,
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
});
