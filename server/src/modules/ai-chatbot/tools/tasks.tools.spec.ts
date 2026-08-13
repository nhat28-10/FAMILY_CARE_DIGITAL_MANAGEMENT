import { FamilyRole } from '@prisma/client';

import type { FamilyMembersService } from '../../family-members/family-members.service';
import type { TasksService } from '../../tasks/services/tasks.service';
import { TasksAiTools } from './tasks.tools';

describe('TasksAiTools', () => {
  it('falls back to user fullName/email for family member displayName', async () => {
    const familyMembersService = {
      listByFamily: jest.fn().mockResolvedValue([
        {
          id: 'member-1',
          displayName: null,
          familyRole: FamilyRole.FAMILY_MANAGER,
          relationship: null,
          user: {
            fullName: 'Nguyễn An',
            email: 'an@example.com',
          },
        },
        {
          id: 'member-2',
          displayName: null,
          familyRole: FamilyRole.FAMILY_MEMBER,
          relationship: null,
          user: {
            fullName: null,
            email: 'bin@example.com',
          },
        },
      ]),
    };
    const tools = new TasksAiTools(
      {} as TasksService,
      familyMembersService as unknown as FamilyMembersService,
    );
    const tool = tools
      .getTools()
      .find((item) => item.name === 'list_family_members');

    const result = await tool?.execute?.(
      {},
      {
        familyId: 'family-1',
        memberId: 'member-current',
        familyRole: FamilyRole.FAMILY_MANAGER,
      },
    );

    expect(result).toEqual([
      {
        id: 'member-1',
        displayName: 'Nguyễn An',
        familyRole: FamilyRole.FAMILY_MANAGER,
        relationship: null,
      },
      {
        id: 'member-2',
        displayName: 'bin@example.com',
        familyRole: FamilyRole.FAMILY_MEMBER,
        relationship: null,
      },
    ]);
  });
});
