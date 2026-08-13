-- Remove the old unique index before renaming the column.
DROP INDEX IF EXISTS "password_reset_tokens_tokenHash_key";

-- Preserve existing hashes instead of dropping the column.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'password_reset_tokens'
          AND column_name = 'tokenHash'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'password_reset_tokens'
          AND column_name = 'codeHash'
    ) THEN
        ALTER TABLE "password_reset_tokens"
        RENAME COLUMN "tokenHash" TO "codeHash";
    END IF;
END
$$;

-- Add the OTP failed-attempt counter.
ALTER TABLE "password_reset_tokens"
ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;

-- Ensure the Prisma schema requirement.
ALTER TABLE "password_reset_tokens"
ALTER COLUMN "codeHash" SET NOT NULL;

-- Rename only when the old index exists and the target name does not.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_class
        WHERE relkind = 'i'
          AND relname =
            'goal_contribution_plans_goalId_memberId_periodMonth_periodYear_'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM pg_class
        WHERE relkind = 'i'
          AND relname =
            'goal_contribution_plans_goalId_memberId_periodMonth_periodY_key'
    ) THEN
        ALTER INDEX
          "goal_contribution_plans_goalId_memberId_periodMonth_periodYear_"
        RENAME TO
          "goal_contribution_plans_goalId_memberId_periodMonth_periodY_key";
    END IF;
END
$$;

