ALTER TABLE "stock_purchases"
  ADD COLUMN "allocationRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "allocationHouseholdQuantity" DECIMAL(12,3),
  ADD CONSTRAINT "stock_purchases_household_quantity_nonnegative" CHECK ("allocationHouseholdQuantity" >= 0);
CREATE TABLE "purchase_project_allocations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "purchaseId" TEXT NOT NULL REFERENCES "stock_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "projectId" TEXT REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "projectName" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL CHECK ("quantity" > 0)
);
CREATE UNIQUE INDEX "purchase_project_allocations_purchaseId_projectId_key" ON "purchase_project_allocations"("purchaseId", "projectId");
CREATE INDEX "purchase_project_allocations_projectId_idx" ON "purchase_project_allocations"("projectId");
