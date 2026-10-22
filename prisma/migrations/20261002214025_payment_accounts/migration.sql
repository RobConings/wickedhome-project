-- CreateEnum
CREATE TYPE "PaymentAccountKind" AS ENUM ('JOINT', 'PERSONAL');

-- AlterTable
ALTER TABLE "bill_series" ADD COLUMN     "paymentAccountId" TEXT;

-- AlterTable
ALTER TABLE "bills" ADD COLUMN     "paymentAccountId" TEXT;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "paymentAccountId" TEXT;

-- CreateTable
CREATE TABLE "payment_accounts" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PaymentAccountKind" NOT NULL,
    "iban" TEXT,
    "color" TEXT NOT NULL,
    "icon" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_account_owners" (
    "accountId" TEXT NOT NULL,
    "habitantId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payment_account_owners_pkey" PRIMARY KEY ("accountId","habitantId")
);

-- CreateIndex
CREATE INDEX "payment_accounts_householdId_idx" ON "payment_accounts"("householdId");

-- CreateIndex
CREATE INDEX "payment_account_owners_habitantId_idx" ON "payment_account_owners"("habitantId");

-- CreateIndex
CREATE INDEX "bills_paymentAccountId_idx" ON "bills"("paymentAccountId");

-- AddForeignKey
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_account_owners" ADD CONSTRAINT "payment_account_owners_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "payment_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_account_owners" ADD CONSTRAINT "payment_account_owners_habitantId_fkey" FOREIGN KEY ("habitantId") REFERENCES "habitants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_series" ADD CONSTRAINT "bill_series_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

