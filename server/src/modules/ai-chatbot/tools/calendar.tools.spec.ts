import { FamilyRole } from '@prisma/client';

import type { CalendarService } from '../../calendar/calendar.service';
import { CalendarAiTools } from './calendar.tools';

describe('CalendarAiTools write proposals', () => {
  let tools: CalendarAiTools;

  beforeEach(() => {
    tools = new CalendarAiTools({} as CalendarService);
  });

  const calendarTool = () => {
    const tool = tools
      .getTools()
      .find((item) => item.name === 'propose_create_calendar_event');
    if (!tool?.buildActionPayload) {
      throw new Error('propose_create_calendar_event not found');
    }
    return tool;
  };

  it('maps cuoi tuan nay from Sunday to the next Saturday and preserves proposed time', async () => {
    const payload = await calendarTool().buildActionPayload!(
      {
        title: 'Chuyen du lich cuoi tuan',
        startTime: '2026-08-13T19:00:00+07:00',
      },
      {
        familyId: 'family-1',
        memberId: 'member-1',
        familyRole: FamilyRole.FAMILY_MANAGER,
        userContent: 'Tao lich di choi cuoi tuan nay',
        now: new Date('2026-08-09T03:04:05.000Z'),
      },
    );

    expect(payload.startTime).toBe('2026-08-15T19:00:00+07:00');
  });

  it('defaults cuoi tuan nay calendar time to 19:00 when model only sends a date', async () => {
    const payload = await calendarTool().buildActionPayload!(
      {
        title: 'Di choi cuoi tuan',
        startTime: '2026-08-13',
      },
      {
        familyId: 'family-1',
        memberId: 'member-1',
        familyRole: FamilyRole.FAMILY_MANAGER,
        userContent: 'Tao lich di choi cuoi tuan nay',
        now: new Date('2026-08-09T03:04:05.000Z'),
      },
    );

    expect(payload.startTime).toBe('2026-08-15T19:00:00+07:00');
  });
});
