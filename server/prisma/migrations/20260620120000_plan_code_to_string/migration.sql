-- Convert subscription_plans.planCode from enum to free-form text so admins can
-- create arbitrary tiers (not just FREE/PLUS/PREMIUM). Existing values are kept.

-- AlterColumn: enum -> text
ALTER TABLE "subscription_plans"
  ALTER COLUMN "planCode" TYPE TEXT USING "planCode"::text;

-- DropEnum (no longer referenced)
DROP TYPE "SubscriptionPlanCode";
