-- CreateTable
CREATE TABLE "home_actions" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "published" JSONB,
    "publishedRevision" INTEGER,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_action_runs" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "detail" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_action_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_rules" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "published" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "publishedRevision" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "home_actions_householdId_archived_idx" ON "home_actions"("householdId", "archived");

-- CreateIndex
CREATE INDEX "home_action_runs_householdId_startedAt_idx" ON "home_action_runs"("householdId", "startedAt");

-- CreateIndex
CREATE INDEX "home_action_runs_householdId_status_idx" ON "home_action_runs"("householdId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "home_action_runs_householdId_requestKey_key" ON "home_action_runs"("householdId", "requestKey");

-- CreateIndex
CREATE INDEX "home_rules_householdId_idx" ON "home_rules"("householdId");

-- AddForeignKey
ALTER TABLE "home_actions" ADD CONSTRAINT "home_actions_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_action_runs" ADD CONSTRAINT "home_action_runs_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_action_runs" ADD CONSTRAINT "home_action_runs_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "home_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_rules" ADD CONSTRAINT "home_rules_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_rules" ADD CONSTRAINT "home_rules_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "home_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

