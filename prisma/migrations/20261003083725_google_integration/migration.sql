-- CreateEnum
CREATE TYPE "GoogleConnectionStatus" AS ENUM ('CONNECTED', 'NEEDS_RECONNECT');

-- CreateEnum
CREATE TYPE "GoogleCalendarVisibility" AS ENUM ('HOUSEHOLD', 'PRIVATE');

-- CreateEnum
CREATE TYPE "MailSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED');

-- CreateTable
CREATE TABLE "google_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "googleAccountEmail" TEXT NOT NULL,
    "googleSubject" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "scopes" TEXT[],
    "status" "GoogleConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastError" TEXT,
    "publishCalendarId" TEXT,
    "publishCategories" TEXT[],
    "lastPublishedAt" TIMESTAMP(3),
    "publishError" TEXT,
    "gmailLastScanAt" TIMESTAMP(3),
    "gmailError" TEXT,
    "driveAppFolderId" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_oauth_states" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "codeVerifierEnc" TEXT NOT NULL,
    "scopes" TEXT[],
    "redirectUri" TEXT NOT NULL,
    "codeEnc" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_calendars" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "googleCalendarId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "accessRole" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "GoogleCalendarVisibility" NOT NULL DEFAULT 'HOUSEHOLD',
    "syncToken" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_calendar_events" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "allDay" BOOLEAN NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "startDay" DATE NOT NULL,
    "endDay" DATE NOT NULL,
    "htmlLink" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_published_events" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "googleCalendarId" TEXT NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_published_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_bill_rules" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "senders" TEXT[],
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "builtInKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_bill_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_bill_suggestions" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "ruleId" TEXT,
    "gmailMessageId" TEXT NOT NULL,
    "attachmentPartId" TEXT,
    "attachmentName" TEXT,
    "payee" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER,
    "dueDate" DATE,
    "structuredCommunication" TEXT,
    "iban" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "status" "MailSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "expenseId" TEXT,
    "documentFileId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_bill_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_drive_links" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "driveFolderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_drive_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_connections_userId_key" ON "google_connections"("userId");

-- CreateIndex
CREATE INDEX "google_connections_householdId_idx" ON "google_connections"("householdId");

-- CreateIndex
CREATE INDEX "google_oauth_states_userId_idx" ON "google_oauth_states"("userId");

-- CreateIndex
CREATE INDEX "google_oauth_states_expiresAt_idx" ON "google_oauth_states"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "google_calendars_connectionId_googleCalendarId_key" ON "google_calendars"("connectionId", "googleCalendarId");

-- CreateIndex
CREATE INDEX "google_calendar_events_calendarId_startDay_endDay_idx" ON "google_calendar_events"("calendarId", "startDay", "endDay");

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_events_calendarId_googleEventId_key" ON "google_calendar_events"("calendarId", "googleEventId");

-- CreateIndex
CREATE UNIQUE INDEX "google_published_events_connectionId_calendarEventId_key" ON "google_published_events"("connectionId", "calendarEventId");

-- CreateIndex
CREATE INDEX "mail_bill_rules_householdId_idx" ON "mail_bill_rules"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "mail_bill_rules_householdId_builtInKey_key" ON "mail_bill_rules"("householdId", "builtInKey");

-- CreateIndex
CREATE INDEX "mail_bill_suggestions_householdId_status_idx" ON "mail_bill_suggestions"("householdId", "status");

-- CreateIndex
CREATE INDEX "mail_bill_suggestions_householdId_dedupeKey_idx" ON "mail_bill_suggestions"("householdId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "mail_bill_suggestions_connectionId_gmailMessageId_key" ON "mail_bill_suggestions"("connectionId", "gmailMessageId");

-- CreateIndex
CREATE INDEX "google_drive_links_householdId_idx" ON "google_drive_links"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "google_drive_links_connectionId_driveFolderId_key" ON "google_drive_links"("connectionId", "driveFolderId");

-- AddForeignKey
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_oauth_states" ADD CONSTRAINT "google_oauth_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_calendars" ADD CONSTRAINT "google_calendars_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "google_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_calendar_events" ADD CONSTRAINT "google_calendar_events_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "google_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_published_events" ADD CONSTRAINT "google_published_events_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "google_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_bill_rules" ADD CONSTRAINT "mail_bill_rules_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_bill_suggestions" ADD CONSTRAINT "mail_bill_suggestions_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_bill_suggestions" ADD CONSTRAINT "mail_bill_suggestions_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "google_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_bill_suggestions" ADD CONSTRAINT "mail_bill_suggestions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "mail_bill_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_drive_links" ADD CONSTRAINT "google_drive_links_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_drive_links" ADD CONSTRAINT "google_drive_links_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "google_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

