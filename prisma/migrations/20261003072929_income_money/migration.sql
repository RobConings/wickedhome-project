-- CreateEnum
CREATE TYPE "IncomeKind" AS ENUM ('SALARY', 'HOLIDAY_PAY', 'BONUS', 'MEAL_VOUCHERS', 'BENEFIT', 'TAX_RETURN', 'GREEN_CERTIFICATES', 'GIFT', 'SALE', 'OTHER');

-- CreateEnum
CREATE TYPE "IncomeAmountMode" AS ENUM ('FIXED', 'VARIABLE');

-- CreateEnum
CREATE TYPE "AccountEntryType" AS ENUM ('CONTRIBUTION', 'TRANSFER', 'INCOME', 'CORRECTION', 'OTHER');

-- AlterEnum
ALTER TYPE "PaymentAccountKind" ADD VALUE 'SAVINGS';

-- CreateTable
CREATE TABLE "income_sources" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "habitantId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "IncomeKind" NOT NULL,
    "rrule" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "amountMode" "IncomeAmountMode" NOT NULL DEFAULT 'FIXED',
    "estimateCents" INTEGER,
    "targetAccountId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "income_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_amounts" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "income_amounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incomes" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "habitantId" TEXT,
    "date" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "kind" "IncomeKind" NOT NULL,
    "description" TEXT,
    "sourceId" TEXT,
    "periodDate" DATE,
    "targetAccountId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_entries" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "type" "AccountEntryType" NOT NULL,
    "habitantId" TEXT,
    "counterpartAccountId" TEXT,
    "transferId" TEXT,
    "balanceCents" INTEGER,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contribution_plans" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "habitantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "activeFrom" DATE NOT NULL,
    "activeTo" DATE,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contribution_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "income_sources_householdId_idx" ON "income_sources"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "income_amounts_sourceId_effectiveFrom_key" ON "income_amounts"("sourceId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "incomes_householdId_date_idx" ON "incomes"("householdId", "date");

-- CreateIndex
CREATE INDEX "incomes_targetAccountId_idx" ON "incomes"("targetAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "incomes_sourceId_periodDate_key" ON "incomes"("sourceId", "periodDate");

-- CreateIndex
CREATE INDEX "account_entries_accountId_date_idx" ON "account_entries"("accountId", "date");

-- CreateIndex
CREATE INDEX "account_entries_householdId_date_idx" ON "account_entries"("householdId", "date");

-- CreateIndex
CREATE INDEX "account_entries_transferId_idx" ON "account_entries"("transferId");

-- CreateIndex
CREATE INDEX "contribution_plans_householdId_idx" ON "contribution_plans"("householdId");

-- AddForeignKey
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_habitantId_fkey" FOREIGN KEY ("habitantId") REFERENCES "habitants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_targetAccountId_fkey" FOREIGN KEY ("targetAccountId") REFERENCES "payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_amounts" ADD CONSTRAINT "income_amounts_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "income_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_habitantId_fkey" FOREIGN KEY ("habitantId") REFERENCES "habitants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "income_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_targetAccountId_fkey" FOREIGN KEY ("targetAccountId") REFERENCES "payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_entries" ADD CONSTRAINT "account_entries_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_entries" ADD CONSTRAINT "account_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "payment_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_entries" ADD CONSTRAINT "account_entries_habitantId_fkey" FOREIGN KEY ("habitantId") REFERENCES "habitants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_entries" ADD CONSTRAINT "account_entries_counterpartAccountId_fkey" FOREIGN KEY ("counterpartAccountId") REFERENCES "payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_entries" ADD CONSTRAINT "account_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_plans" ADD CONSTRAINT "contribution_plans_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_plans" ADD CONSTRAINT "contribution_plans_habitantId_fkey" FOREIGN KEY ("habitantId") REFERENCES "habitants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_plans" ADD CONSTRAINT "contribution_plans_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "payment_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

