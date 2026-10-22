-- CreateEnum
CREATE TYPE "ExpenseKind" AS ENUM ('SUBSCRIPTION', 'LOAN', 'DOWN_PAYMENT', 'INSURANCE', 'UTILITY', 'TAX', 'OTHER');

-- CreateEnum
CREATE TYPE "RecurringExpenseStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('DIRECT_DEBIT', 'WIRE_TRANSFER', 'CARD', 'CASH', 'MEAL_VOUCHER', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpensePayerType" AS ENUM ('JOINT', 'PERSON', 'SPLIT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BillCategory" ADD VALUE 'GROCERIES';
ALTER TYPE "BillCategory" ADD VALUE 'HOUSEHOLD';
ALTER TYPE "BillCategory" ADD VALUE 'EATING_OUT';
ALTER TYPE "BillCategory" ADD VALUE 'TRANSPORT';
ALTER TYPE "BillCategory" ADD VALUE 'LEISURE';
ALTER TYPE "BillCategory" ADD VALUE 'GIFTS';
ALTER TYPE "BillCategory" ADD VALUE 'CLOTHING';
ALTER TYPE "BillCategory" ADD VALUE 'PERSONAL_CARE';
ALTER TYPE "BillCategory" ADD VALUE 'PETS';
ALTER TYPE "BillCategory" ADD VALUE 'SUBSCRIPTIONS';
ALTER TYPE "BillCategory" ADD VALUE 'LOANS';

-- AlterTable
ALTER TABLE "bill_series" ADD COLUMN     "beneficiaryName" TEXT,
ADD COLUMN     "bic" TEXT,
ADD COLUMN     "candidateToCancel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "endDate" DATE,
ADD COLUMN     "kind" "ExpenseKind" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "legacySubscriptionId" TEXT,
ADD COLUMN     "payerHabitantId" TEXT,
ADD COLUMN     "payerType" "ExpensePayerType" NOT NULL DEFAULT 'JOINT',
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "remindDaysBefore" INTEGER,
ADD COLUMN     "status" "RecurringExpenseStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "trialEndsOn" DATE,
ADD COLUMN     "websiteUrl" TEXT;

-- AlterTable
ALTER TABLE "bills" ADD COLUMN     "autoPaidAt" TIMESTAMP(3),
ADD COLUMN     "beneficiaryName" TEXT,
ADD COLUMN     "bic" TEXT,
ADD COLUMN     "payerHabitantId" TEXT,
ADD COLUMN     "payerType" "ExpensePayerType" NOT NULL DEFAULT 'JOINT',
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "shopId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "bill_series_legacySubscriptionId_key" ON "bill_series"("legacySubscriptionId");

-- AddForeignKey
ALTER TABLE "bill_series" ADD CONSTRAINT "bill_series_payerHabitantId_fkey" FOREIGN KEY ("payerHabitantId") REFERENCES "habitants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_payerHabitantId_fkey" FOREIGN KEY ("payerHabitantId") REFERENCES "habitants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

