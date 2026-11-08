-- Optional typed relationship; existing task and device records are preserved.
ALTER TABLE "tasks" ADD COLUMN "deviceId" TEXT;
CREATE INDEX "tasks_deviceId_idx" ON "tasks"("deviceId");
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
