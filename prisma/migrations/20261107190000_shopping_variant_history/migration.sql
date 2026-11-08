ALTER TABLE "stock_purchases"
  ADD COLUMN "purchasedProductId" TEXT,
  ADD COLUMN "purchasedProductName" TEXT;

-- Preserve the existing visit label before future variant changes. Canonical productId stays intact.
UPDATE "stock_purchases" AS purchase
SET "purchasedProductId" = item."productId",
    "purchasedProductName" = item."name"
FROM "shopping_session_items" AS item
WHERE purchase."sessionItemId" = item."id";
