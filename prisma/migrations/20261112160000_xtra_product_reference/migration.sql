ALTER TABLE "products" ADD COLUMN "colruytProductId" TEXT;
CREATE UNIQUE INDEX "products_householdId_colruytProductId_key" ON "products"("householdId", "colruytProductId");
