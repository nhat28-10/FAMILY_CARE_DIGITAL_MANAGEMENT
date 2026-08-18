CREATE TYPE "SosTriggerReason" AS ENUM ('MANUAL', 'FALL_DETECTION');

ALTER TABLE "sos_alerts"
ADD COLUMN "trigger_reason" "SosTriggerReason" NOT NULL DEFAULT 'MANUAL';
