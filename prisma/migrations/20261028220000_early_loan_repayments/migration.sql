-- Extra repayments are expenses independent of scheduled instalments, so several can share a date.
ALTER TABLE "bills" ADD COLUMN "earlyRepaymentForId" TEXT;
CREATE INDEX "bills_earlyRepaymentForId_idx" ON "bills"("earlyRepaymentForId");
ALTER TABLE "bills" ADD CONSTRAINT "bills_earlyRepaymentForId_fkey"
  FOREIGN KEY ("earlyRepaymentForId") REFERENCES "bill_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
