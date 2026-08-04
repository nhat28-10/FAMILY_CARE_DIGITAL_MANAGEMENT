-- Add smartwatch health sensor event used by the Wear OS emulator flow.
ALTER TYPE "SensorEventType" ADD VALUE IF NOT EXISTS 'HEART_RATE_ABNORMAL';
