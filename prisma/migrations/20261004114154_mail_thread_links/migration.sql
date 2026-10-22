-- CreateTable
CREATE TABLE "mail_thread_links" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "projectId" TEXT,
    "contactId" TEXT,
    "subject" TEXT NOT NULL,
    "counterpartEmail" TEXT,
    "counterpartName" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "lastFromName" TEXT,
    "lastFromMe" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "checkError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_thread_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mail_thread_links_householdId_projectId_idx" ON "mail_thread_links"("householdId", "projectId");

-- CreateIndex
CREATE INDEX "mail_thread_links_lastMessageAt_idx" ON "mail_thread_links"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "mail_thread_links_userId_gmailThreadId_key" ON "mail_thread_links"("userId", "gmailThreadId");

