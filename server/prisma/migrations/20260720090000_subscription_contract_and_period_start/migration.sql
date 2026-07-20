CREATE TYPE "BillingPeriod" AS ENUM ('FREE', 'MONTHLY', 'YEARLY');

ALTER TABLE "subscription_plans"
ADD COLUMN "billingPeriod" "BillingPeriod" NOT NULL DEFAULT 'YEARLY',
ADD COLUMN "monthlyPrice" DECIMAL(18, 2),
ADD COLUMN "yearlyPrice" DECIMAL(18, 2);

UPDATE "subscription_plans"
SET
  "billingPeriod" = CASE
    WHEN "planCode" = 'FREE' THEN 'FREE'::"BillingPeriod"
    WHEN "planCode" = 'MONTHLY' THEN 'MONTHLY'::"BillingPeriod"
    ELSE 'YEARLY'::"BillingPeriod"
  END,
  "monthlyPrice" = CASE
    WHEN "planCode" = 'MONTHLY' THEN "annualPrice"
    ELSE NULL
  END,
  "yearlyPrice" = CASE
    WHEN "planCode" = 'YEARLY' THEN "annualPrice"
    ELSE NULL
  END;

ALTER TABLE "family_subscriptions"
ADD COLUMN "currentPeriodStart" TIMESTAMP(3);

