-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'ACTIVE', 'DONE', 'CANCELLED');

-- AlterTable
ALTER TABLE "bill_series" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "bills" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "shopping_items" ADD COLUMN     "expenseId" TEXT,
ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT NOT NULL,
    "tag" TEXT,
    "description" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "budgetCents" INTEGER,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNED',
    "coverFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_places" (
    "projectId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,

    CONSTRAINT "project_places_pkey" PRIMARY KEY ("projectId","placeId")
);

-- CreateIndex
CREATE INDEX "projects_householdId_status_idx" ON "projects"("householdId", "status");

-- CreateIndex
CREATE INDEX "project_places_placeId_idx" ON "project_places"("placeId");

-- CreateIndex
CREATE INDEX "bill_series_projectId_idx" ON "bill_series"("projectId");

-- CreateIndex
CREATE INDEX "bills_projectId_idx" ON "bills"("projectId");

-- CreateIndex
CREATE INDEX "shopping_items_projectId_idx" ON "shopping_items"("projectId");

-- CreateIndex
CREATE INDEX "tasks_projectId_idx" ON "tasks"("projectId");

-- AddForeignKey
ALTER TABLE "bill_series" ADD CONSTRAINT "bill_series_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_places" ADD CONSTRAINT "project_places_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_places" ADD CONSTRAINT "project_places_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

