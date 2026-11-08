ALTER TABLE "stock_purchases"
  ADD COLUMN "purchasedQuantity" DECIMAL(12,3),
  ADD COLUMN "purchasedUnit" TEXT;
-- Older stock quantities remain authoritative. Do not invent a historic package conversion.
