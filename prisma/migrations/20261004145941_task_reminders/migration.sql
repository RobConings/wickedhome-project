-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "remindAt" TIMESTAMP(3),
ADD COLUMN     "remindedAt" TIMESTAMP(3),
ADD COLUMN     "reminderMinutes" INTEGER;

-- CreateIndex
CREATE INDEX "tasks_remindedAt_remindAt_idx" ON "tasks"("remindedAt", "remindAt");

-- CreateIndex
CREATE INDEX "tasks_createdById_idx" ON "tasks"("createdById");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

