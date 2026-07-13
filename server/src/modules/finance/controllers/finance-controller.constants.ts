import { FamilyRole } from '@prisma/client';

export const FINANCE_MANAGER_ROLES = [
  FamilyRole.FAMILY_MANAGER,
  FamilyRole.DEPUTY_MEMBER,
] as const;
