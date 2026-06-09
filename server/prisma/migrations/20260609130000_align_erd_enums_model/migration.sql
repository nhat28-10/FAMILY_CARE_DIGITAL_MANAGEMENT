-- =====================================================================
-- Align existing models' enums/relations with the ERD.
-- All steps preserve existing rows via in-place renames or data mapping.
-- =====================================================================

-- 1. FamilyRole: rename MANAGER/MEMBER and add DEPUTY_MEMBER.
--    RENAME VALUE keeps stored data and column defaults consistent.
ALTER TYPE "FamilyRole" RENAME VALUE 'MANAGER' TO 'FAMILY_MANAGER';
ALTER TYPE "FamilyRole" RENAME VALUE 'MEMBER' TO 'FAMILY_MEMBER';
ALTER TYPE "FamilyRole" ADD VALUE 'DEPUTY_MEMBER';

-- 2. InvitationStatus: REJECTED -> CANCELED.
ALTER TYPE "InvitationStatus" RENAME VALUE 'REJECTED' TO 'CANCELED';

-- 3. Relationship: Postgres cannot drop enum values, so recreate the type and
--    map GRANDFATHER/GRANDMOTHER -> GRANDPARENT.
ALTER TYPE "Relationship" RENAME TO "Relationship_old";
CREATE TYPE "Relationship" AS ENUM ('FATHER', 'MOTHER', 'SPOUSE', 'CHILD', 'SISTER', 'BROTHER', 'GRANDPARENT', 'OTHER');

ALTER TABLE "family_members" ALTER COLUMN "relationship" DROP DEFAULT;
ALTER TABLE "invitations" ALTER COLUMN "relationship" DROP DEFAULT;

ALTER TABLE "family_members" ALTER COLUMN "relationship" TYPE "Relationship" USING (
  CASE WHEN "relationship"::text IN ('GRANDFATHER', 'GRANDMOTHER') THEN 'GRANDPARENT' ELSE "relationship"::text END
)::"Relationship";
ALTER TABLE "invitations" ALTER COLUMN "relationship" TYPE "Relationship" USING (
  CASE WHEN "relationship"::text IN ('GRANDFATHER', 'GRANDMOTHER') THEN 'GRANDPARENT' ELSE "relationship"::text END
)::"Relationship";

ALTER TABLE "family_members" ALTER COLUMN "relationship" SET DEFAULT 'OTHER';
ALTER TABLE "invitations" ALTER COLUMN "relationship" SET DEFAULT 'OTHER';

DROP TYPE "Relationship_old";

-- 4. AccountStatus replaces the isActive boolean.
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
ALTER TABLE "users" ADD COLUMN "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE';
UPDATE "users" SET "accountStatus" = CASE WHEN "isActive" THEN 'ACTIVE'::"AccountStatus" ELSE 'SUSPENDED'::"AccountStatus" END;
ALTER TABLE "users" DROP COLUMN "isActive";

-- 5. UserType replaces systemRole (family roles now live on FamilyMember).
CREATE TYPE "UserType" AS ENUM ('NORMAL_USER', 'SYSTEM_ADMIN');
ALTER TABLE "users" ADD COLUMN "userType" "UserType" NOT NULL DEFAULT 'NORMAL_USER';
UPDATE "users" SET "userType" = CASE WHEN "systemRole" = 'ADMIN' THEN 'SYSTEM_ADMIN'::"UserType" ELSE 'NORMAL_USER'::"UserType" END;
ALTER TABLE "users" DROP COLUMN "systemRole";
DROP TYPE "SystemRole";

-- 6. Invitation creator: invitedById (User) -> createdByMemberId (FamilyMember).
ALTER TABLE "invitations" ADD COLUMN "createdByMemberId" TEXT;
UPDATE "invitations" i
  SET "createdByMemberId" = fm."id"
  FROM "family_members" fm
  WHERE fm."familyId" = i."familyId" AND fm."userId" = i."invitedById";
ALTER TABLE "invitations" ALTER COLUMN "createdByMemberId" SET NOT NULL;

ALTER TABLE "invitations" DROP CONSTRAINT "invitations_invitedById_fkey";
ALTER TABLE "invitations" DROP COLUMN "invitedById";

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
