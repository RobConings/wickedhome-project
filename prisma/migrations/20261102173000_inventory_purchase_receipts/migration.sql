-- AlterTable
ALTER TABLE "assistant_images" ADD COLUMN "inventoryPurchaseRecordedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN "assistantImageId" TEXT;

-- CreateIndex
CREATE INDEX "stock_movements_assistantImageId_idx" ON "stock_movements"("assistantImageId");

-- AddForeignKey
ALTER TABLE "stock_movements"
ADD CONSTRAINT "stock_movements_assistantImageId_fkey"
FOREIGN KEY ("assistantImageId") REFERENCES "assistant_images"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
