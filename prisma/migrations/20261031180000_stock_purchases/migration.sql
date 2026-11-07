ALTER TABLE "stock_items" ADD COLUMN "lastCountedAt" TIMESTAMP(3);
CREATE TABLE "stock_purchases" (
  "id" TEXT NOT NULL, "householdId" TEXT NOT NULL, "stockItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL, "shopId" TEXT, "shopConfirmed" BOOLEAN NOT NULL DEFAULT false, "quantity" DECIMAL(12,3) NOT NULL,
  "unit" TEXT, "purchasedAt" TIMESTAMP(3) NOT NULL, "stockAdded" BOOLEAN NOT NULL,
  "shoppingItemId" TEXT, "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_purchases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_purchases_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "stock_purchase_evidence" (
  "id" TEXT NOT NULL, "householdId" TEXT NOT NULL, "sourceKey" TEXT NOT NULL,
  "purchaseIds" TEXT[] NOT NULL, "stockItemId" TEXT NOT NULL, "quantity" DECIMAL(12,3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_purchase_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_purchase_evidence_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "stock_purchases_householdId_productId_purchasedAt_idx" ON "stock_purchases"("householdId", "productId", "purchasedAt");
CREATE INDEX "stock_purchases_householdId_shoppingItemId_idx" ON "stock_purchases"("householdId", "shoppingItemId");
CREATE UNIQUE INDEX "stock_purchase_evidence_householdId_sourceKey_key" ON "stock_purchase_evidence"("householdId", "sourceKey");
CREATE INDEX "stock_purchase_evidence_householdId_idx" ON "stock_purchase_evidence"("householdId");
-- Preserve prior restocks as already credited. This does not rewrite existing stock quantities.
INSERT INTO "stock_purchases" ("id", "householdId", "stockItemId", "productId", "shopId", "quantity", "unit", "purchasedAt", "stockAdded", "shoppingItemId", "userId", "createdAt")
SELECT 'legacy:' || MIN(m."id"), m."householdId", m."stockItemId", s."productId", MIN(i."shopId"), SUM(m."delta"), COALESCE(s."unit", p."unit"), MIN(m."createdAt"), true, m."shoppingItemId", COALESCE(MIN(m."userId"), 'legacy'), MIN(m."createdAt")
FROM "stock_movements" m JOIN "stock_items" s ON s."id" = m."stockItemId" JOIN "products" p ON p."id" = s."productId"
LEFT JOIN "shopping_items" i ON i."id" = m."shoppingItemId" AND i."householdId" = m."householdId"
WHERE m."reason" = 'BOUGHT' AND m."delta" > 0 AND m."shoppingItemId" IS NOT NULL
GROUP BY m."householdId", m."stockItemId", m."shoppingItemId", s."productId", s."unit", p."unit";
INSERT INTO "stock_purchase_evidence" ("id", "householdId", "sourceKey", "purchaseIds", "stockItemId", "quantity", "createdAt")
SELECT "id", "householdId", 'shopping:' || "shoppingItemId", ARRAY["id"], "stockItemId", "quantity", "createdAt" FROM "stock_purchases"
ON CONFLICT ("householdId", "sourceKey") DO NOTHING;
-- Historical scans remain separate acquisitions; a later receipt can be matched without re-adding.
INSERT INTO "stock_purchases" ("id", "householdId", "stockItemId", "productId", "quantity", "unit", "purchasedAt", "stockAdded", "userId", "createdAt")
SELECT 'scan:' || m."id", m."householdId", m."stockItemId", s."productId", m."delta", COALESCE(s."unit", p."unit"), m."createdAt", true, COALESCE(m."userId", 'legacy'), m."createdAt"
FROM "stock_movements" m JOIN "stock_items" s ON s."id" = m."stockItemId" JOIN "products" p ON p."id" = s."productId"
WHERE m."reason" = 'SCAN_ADD' AND m."delta" > 0;
