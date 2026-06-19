-- CreateEnum
CREATE TYPE "TaskUnavailabilityStatus" AS ENUM ('REPORTED', 'HANDLED', 'CANCELED');

-- CreateTable
CREATE TABLE "task_unavailabilities" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "reportedByMemberId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "TaskUnavailabilityStatus" NOT NULL DEFAULT 'REPORTED',
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledByMemberId" TEXT,
    "handledAt" TIMESTAMP(3),

    CONSTRAINT "task_unavailabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_unavailabilities_assignmentId_idx" ON "task_unavailabilities"("assignmentId");

-- CreateIndex
CREATE INDEX "task_unavailabilities_reportedByMemberId_idx" ON "task_unavailabilities"("reportedByMemberId");

-- CreateIndex
CREATE INDEX "task_unavailabilities_handledByMemberId_idx" ON "task_unavailabilities"("handledByMemberId");

-- CreateIndex
CREATE INDEX "task_unavailabilities_status_idx" ON "task_unavailabilities"("status");

-- CreateIndex
CREATE INDEX "task_unavailabilities_reportedAt_idx" ON "task_unavailabilities"("reportedAt");

-- AddForeignKey
ALTER TABLE "task_unavailabilities" ADD CONSTRAINT "task_unavailabilities_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "task_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_unavailabilities" ADD CONSTRAINT "task_unavailabilities_reportedByMemberId_fkey" FOREIGN KEY ("reportedByMemberId") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_unavailabilities" ADD CONSTRAINT "task_unavailabilities_handledByMemberId_fkey" FOREIGN KEY ("handledByMemberId") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
