-- CreateEnum
CREATE TYPE "TaskSubmissionStatus" AS ENUM ('WAITING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TaskProofType" AS ENUM ('IMAGE', 'VIDEO', 'NOTE', 'FILE');

-- CreateTable
CREATE TABLE "task_submissions" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "submittedByMemberId" TEXT NOT NULL,
    "submissionNote" TEXT,
    "status" "TaskSubmissionStatus" NOT NULL DEFAULT 'WAITING_REVIEW',
    "reviewedByMemberId" TEXT,
    "reviewNote" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_proofs" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "proofType" "TaskProofType" NOT NULL,
    "fileUrl" TEXT,
    "thumbnailUrl" TEXT,
    "note" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_submissions_assignmentId_idx" ON "task_submissions"("assignmentId");

-- CreateIndex
CREATE INDEX "task_submissions_submittedByMemberId_idx" ON "task_submissions"("submittedByMemberId");

-- CreateIndex
CREATE INDEX "task_submissions_reviewedByMemberId_idx" ON "task_submissions"("reviewedByMemberId");

-- CreateIndex
CREATE INDEX "task_submissions_status_idx" ON "task_submissions"("status");

-- CreateIndex
CREATE INDEX "task_proofs_submissionId_idx" ON "task_proofs"("submissionId");

-- CreateIndex
CREATE INDEX "task_proofs_proofType_idx" ON "task_proofs"("proofType");

-- AddForeignKey
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "task_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_submittedByMemberId_fkey" FOREIGN KEY ("submittedByMemberId") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_reviewedByMemberId_fkey" FOREIGN KEY ("reviewedByMemberId") REFERENCES "family_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_proofs" ADD CONSTRAINT "task_proofs_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "task_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
