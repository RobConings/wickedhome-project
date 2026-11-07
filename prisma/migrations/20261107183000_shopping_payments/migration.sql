-- CreateTable
CREATE TABLE "shopping_payments" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "receiptId" TEXT,
    "expenseId" TEXT,
    "originalExpenseId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopping_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shopping_payments_expenseId_key" ON "shopping_payments"("expenseId");

-- CreateIndex
CREATE INDEX "shopping_payments_purchaseId_idx" ON "shopping_payments"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_payments_householdId_sourceKey_key" ON "shopping_payments"("householdId", "sourceKey");

-- AddForeignKey
ALTER TABLE "shopping_payments" ADD CONSTRAINT "shopping_payments_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "shopping_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_payments" ADD CONSTRAINT "shopping_payments_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "shopping_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_payments" ADD CONSTRAINT "shopping_payments_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
