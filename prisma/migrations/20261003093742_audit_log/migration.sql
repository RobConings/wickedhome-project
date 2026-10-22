-- CreateEnum
CREATE TYPE "AuditChannel" AS ENUM ('APP', 'ASSISTANT', 'MCP', 'JOB');

-- CreateTable
CREATE TABLE "audit_entries" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT,
    "actorName" TEXT NOT NULL,
    "channel" "AuditChannel" NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "targetLabel" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_entries_householdId_createdAt_idx" ON "audit_entries"("householdId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_entries_householdId_userId_createdAt_idx" ON "audit_entries"("householdId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_entries_createdAt_idx" ON "audit_entries"("createdAt");

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

