-- CreateTable
CREATE TABLE "household_shop_settings" (
    "householdId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "ingredientSearch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "household_shop_settings_pkey" PRIMARY KEY ("householdId","shopId")
);

-- CreateIndex
CREATE INDEX "household_shop_settings_shopId_idx" ON "household_shop_settings"("shopId");

-- AddForeignKey
ALTER TABLE "household_shop_settings" ADD CONSTRAINT "household_shop_settings_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_shop_settings" ADD CONSTRAINT "household_shop_settings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
