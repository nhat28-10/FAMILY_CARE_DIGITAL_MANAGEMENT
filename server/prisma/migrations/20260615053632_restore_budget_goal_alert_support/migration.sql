-- AlterTable
ALTER TABLE "budget_alerts" ADD COLUMN     "financeLedgerId" TEXT;

-- AlterTable
ALTER TABLE "budget_lines" ADD COLUMN     "financeLedgerId" TEXT;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_financeLedgerId_fkey" FOREIGN KEY ("financeLedgerId") REFERENCES "finance_ledgers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_financeLedgerId_fkey" FOREIGN KEY ("financeLedgerId") REFERENCES "finance_ledgers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
