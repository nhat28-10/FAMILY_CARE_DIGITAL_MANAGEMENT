-- CreateEnum
CREATE TYPE "TaskRepeatType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "TaskScheduleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "task_schedules" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "repeatType" "TaskRepeatType" NOT NULL,
    "repeatInterval" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "dayOfWeek" INTEGER,
    "status" "TaskScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_schedules_taskId_key" ON "task_schedules"("taskId");

-- CreateIndex
CREATE INDEX "task_schedules_taskId_idx" ON "task_schedules"("taskId");

-- CreateIndex
CREATE INDEX "task_schedules_status_idx" ON "task_schedules"("status");

-- CreateIndex
CREATE INDEX "task_schedules_startDate_idx" ON "task_schedules"("startDate");

-- AddForeignKey
ALTER TABLE "task_schedules" ADD CONSTRAINT "task_schedules_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
