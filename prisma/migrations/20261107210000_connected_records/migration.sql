ALTER TABLE "devices" ADD COLUMN "coverFileId" TEXT;
ALTER TABLE "bills" ADD COLUMN "allocationHouseholdCents" INTEGER;
ALTER TABLE "bills" ADD CONSTRAINT "bills_allocation_household_nonnegative"
  CHECK ("allocationHouseholdCents" IS NULL OR "allocationHouseholdCents" >= 0);

CREATE TABLE "expense_project_allocations" (
  "id" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "projectId" TEXT,
  "projectName" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  CONSTRAINT "expense_project_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expense_project_allocations_positive" CHECK ("amountCents" > 0),
  CONSTRAINT "expense_project_allocations_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "expense_project_allocations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "expense_project_allocations_expenseId_projectId_key" ON "expense_project_allocations"("expenseId", "projectId");
CREATE INDEX "expense_project_allocations_projectId_idx" ON "expense_project_allocations"("projectId");
