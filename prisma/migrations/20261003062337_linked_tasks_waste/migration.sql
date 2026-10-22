-- CreateEnum
CREATE TYPE "WasteTaskTiming" AS ENUM ('EVENING_BEFORE', 'MORNING_OF');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "dueTime" TEXT,
ADD COLUMN     "originDate" DATE,
ADD COLUMN     "originHref" TEXT,
ADD COLUMN     "originId" TEXT,
ADD COLUMN     "originType" TEXT;

-- AlterTable
ALTER TABLE "waste_setups" ADD COLUMN     "taskAssigneeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "taskEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "taskRotate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "taskTiming" "WasteTaskTiming" NOT NULL DEFAULT 'EVENING_BEFORE';

-- CreateIndex
CREATE UNIQUE INDEX "tasks_householdId_originType_originId_key" ON "tasks"("householdId", "originType", "originId");

