-- CreateEnum
CREATE TYPE "AssistantMessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- CreateEnum
CREATE TYPE "AssistantToolStatus" AS ENUM ('PENDING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssistantTokenScope" AS ENUM ('READ', 'WRITE');

-- CreateEnum
CREATE TYPE "AlarmAction" AS ENUM ('ARM_HOME', 'ARM_AWAY', 'DISARM');

-- CreateEnum
CREATE TYPE "AlarmActionResult" AS ENUM ('SUCCEEDED', 'FAILED', 'REFUSED', 'RATE_LIMITED');

-- CreateTable
CREATE TABLE "assistant_conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AssistantMessageRole" NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "toolCalls" JSONB,
    "toolCallId" TEXT,
    "toolName" TEXT,
    "toolArgs" JSONB,
    "toolResult" JSONB,
    "toolStatus" "AssistantToolStatus",
    "toolSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_tool_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_tool_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_access_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scope" "AssistantTokenScope" NOT NULL DEFAULT 'READ',
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_assistant_settings" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "alarmEntityId" TEXT,
    "energyImportEnabled" BOOLEAN NOT NULL DEFAULT true,
    "energyBackfillDays" INTEGER NOT NULL DEFAULT 30,
    "energyLastImportAt" TIMESTAMP(3),
    "energyLastResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_assistant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alarm_action_logs" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT,
    "actorName" TEXT NOT NULL,
    "action" "AlarmAction" NOT NULL,
    "result" "AlarmActionResult" NOT NULL,
    "entityId" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alarm_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_conversations_userId_lastMessageAt_idx" ON "assistant_conversations"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "assistant_conversations_lastMessageAt_idx" ON "assistant_conversations"("lastMessageAt");

-- CreateIndex
CREATE INDEX "assistant_messages_conversationId_createdAt_idx" ON "assistant_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_tool_preferences_userId_toolName_key" ON "assistant_tool_preferences"("userId", "toolName");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_access_tokens_tokenHash_key" ON "assistant_access_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "assistant_access_tokens_userId_idx" ON "assistant_access_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "home_assistant_settings_householdId_key" ON "home_assistant_settings"("householdId");

-- CreateIndex
CREATE INDEX "alarm_action_logs_householdId_createdAt_idx" ON "alarm_action_logs"("householdId", "createdAt");

-- AddForeignKey
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "assistant_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_tool_preferences" ADD CONSTRAINT "assistant_tool_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_access_tokens" ADD CONSTRAINT "assistant_access_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_assistant_settings" ADD CONSTRAINT "home_assistant_settings_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarm_action_logs" ADD CONSTRAINT "alarm_action_logs_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarm_action_logs" ADD CONSTRAINT "alarm_action_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

