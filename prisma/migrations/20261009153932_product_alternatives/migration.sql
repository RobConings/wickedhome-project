-- AlterTable
ALTER TABLE "products" ADD COLUMN     "stockProductId" TEXT;

-- CreateIndex
CREATE INDEX "products_stockProductId_idx" ON "products"("stockProductId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_stockProductId_fkey" FOREIGN KEY ("stockProductId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
