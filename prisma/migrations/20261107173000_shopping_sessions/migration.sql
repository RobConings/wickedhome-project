-- CreateEnum
CREATE TYPE "ShoppingSessionStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ShoppingSessionItemStatus" AS ENUM ('OPEN', 'BOUGHT', 'SKIPPED');

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "stockPurchaseId" TEXT;

-- AlterTable
ALTER TABLE "stock_purchases" ADD COLUMN     "sessionItemId" TEXT,
ADD COLUMN     "shoppingPurchaseId" TEXT;

-- CreateTable
CREATE TABLE "shopping_sessions" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shopIds" TEXT[],
    "shopGroupId" TEXT,
    "status" "ShoppingSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shopping_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_session_participants" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopping_session_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_session_items" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "productId" TEXT,
    "itemKey" TEXT NOT NULL,
    "requirementIds" TEXT[],
    "name" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL DEFAULT 'OTHER',
    "quantity" DECIMAL(12,3) NOT NULL,
    "purchasedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "shopId" TEXT,
    "stockItemId" TEXT,
    "status" "ShoppingSessionItemStatus" NOT NULL DEFAULT 'OPEN',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_session_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_purchases" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "shopId" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalCents" INTEGER,

    CONSTRAINT "shopping_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_receipts" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "documentId" TEXT,
    "contentHash" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "totalCents" INTEGER,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopping_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shopping_sessions_householdId_startedAt_idx" ON "shopping_sessions"("householdId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_session_participants_sessionId_userId_key" ON "shopping_session_participants"("sessionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_session_items_sessionId_itemKey_key" ON "shopping_session_items"("sessionId", "itemKey");

-- CreateIndex
CREATE INDEX "shopping_purchases_sessionId_idx" ON "shopping_purchases"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_purchases_householdId_sourceKey_key" ON "shopping_purchases"("householdId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_receipts_householdId_contentHash_key" ON "shopping_receipts"("householdId", "contentHash");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stockPurchaseId_fkey" FOREIGN KEY ("stockPurchaseId") REFERENCES "stock_purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_purchases" ADD CONSTRAINT "stock_purchases_shoppingPurchaseId_fkey" FOREIGN KEY ("shoppingPurchaseId") REFERENCES "shopping_purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_purchases" ADD CONSTRAINT "stock_purchases_sessionItemId_fkey" FOREIGN KEY ("sessionItemId") REFERENCES "shopping_session_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_sessions" ADD CONSTRAINT "shopping_sessions_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_session_participants" ADD CONSTRAINT "shopping_session_participants_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "shopping_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_session_items" ADD CONSTRAINT "shopping_session_items_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "shopping_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_purchases" ADD CONSTRAINT "shopping_purchases_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "shopping_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_receipts" ADD CONSTRAINT "shopping_receipts_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "shopping_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
