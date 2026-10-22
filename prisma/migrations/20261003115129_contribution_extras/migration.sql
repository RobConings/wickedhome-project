-- CreateTable
CREATE TABLE "contribution_extras" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "habitantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contribution_extras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contribution_extras_householdId_habitantId_accountId_month_key" ON "contribution_extras"("householdId", "habitantId", "accountId", "month");

-- AddForeignKey
ALTER TABLE "contribution_extras" ADD CONSTRAINT "contribution_extras_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_extras" ADD CONSTRAINT "contribution_extras_habitantId_fkey" FOREIGN KEY ("habitantId") REFERENCES "habitants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_extras" ADD CONSTRAINT "contribution_extras_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "payment_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

