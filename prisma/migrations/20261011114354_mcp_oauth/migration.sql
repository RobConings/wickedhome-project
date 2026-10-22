-- CreateEnum
CREATE TYPE "McpOAuthClientKind" AS ENUM ('DYNAMIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "McpOAuthScope" AS ENUM ('READ', 'WRITE');

-- CreateEnum
CREATE TYPE "McpOAuthTokenKind" AS ENUM ('ACCESS', 'REFRESH');

-- CreateTable
CREATE TABLE "mcp_oauth_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "dcrEnabled" BOOLEAN NOT NULL DEFAULT true,
    "allowedRedirectHosts" TEXT[] DEFAULT ARRAY['chatgpt.com', 'claude.ai']::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_oauth_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_oauth_clients" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "McpOAuthClientKind" NOT NULL,
    "name" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "secretHash" TEXT,
    "tokenEndpointAuthMethod" TEXT NOT NULL DEFAULT 'none',
    "householdId" TEXT,
    "createdById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_oauth_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_oauth_authorization_requests" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "state" TEXT,
    "codeChallenge" TEXT NOT NULL,
    "scopes" TEXT[],
    "resource" TEXT NOT NULL,
    "userId" TEXT,
    "csrfHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_oauth_authorization_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_oauth_authorization_codes" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "scope" "McpOAuthScope" NOT NULL,
    "resource" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "grantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_oauth_authorization_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_oauth_grants" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "scope" "McpOAuthScope" NOT NULL,
    "resource" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_oauth_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_oauth_tokens" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "kind" "McpOAuthTokenKind" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scope" "McpOAuthScope" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_oauth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_clients_clientId_key" ON "mcp_oauth_clients"("clientId");

-- CreateIndex
CREATE INDEX "mcp_oauth_clients_kind_lastUsedAt_idx" ON "mcp_oauth_clients"("kind", "lastUsedAt");

-- CreateIndex
CREATE INDEX "mcp_oauth_clients_householdId_idx" ON "mcp_oauth_clients"("householdId");

-- CreateIndex
CREATE INDEX "mcp_oauth_authorization_requests_expiresAt_idx" ON "mcp_oauth_authorization_requests"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_authorization_codes_codeHash_key" ON "mcp_oauth_authorization_codes"("codeHash");

-- CreateIndex
CREATE INDEX "mcp_oauth_authorization_codes_expiresAt_idx" ON "mcp_oauth_authorization_codes"("expiresAt");

-- CreateIndex
CREATE INDEX "mcp_oauth_grants_householdId_idx" ON "mcp_oauth_grants"("householdId");

-- CreateIndex
CREATE INDEX "mcp_oauth_grants_userId_idx" ON "mcp_oauth_grants"("userId");

-- CreateIndex
CREATE INDEX "mcp_oauth_grants_clientId_idx" ON "mcp_oauth_grants"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_tokens_tokenHash_key" ON "mcp_oauth_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "mcp_oauth_tokens_grantId_idx" ON "mcp_oauth_tokens"("grantId");

-- CreateIndex
CREATE INDEX "mcp_oauth_tokens_expiresAt_idx" ON "mcp_oauth_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "mcp_oauth_clients" ADD CONSTRAINT "mcp_oauth_clients_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_oauth_clients" ADD CONSTRAINT "mcp_oauth_clients_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_oauth_authorization_requests" ADD CONSTRAINT "mcp_oauth_authorization_requests_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "mcp_oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_oauth_authorization_requests" ADD CONSTRAINT "mcp_oauth_authorization_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_oauth_authorization_codes" ADD CONSTRAINT "mcp_oauth_authorization_codes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "mcp_oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_oauth_authorization_codes" ADD CONSTRAINT "mcp_oauth_authorization_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_oauth_authorization_codes" ADD CONSTRAINT "mcp_oauth_authorization_codes_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "mcp_oauth_grants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_oauth_grants" ADD CONSTRAINT "mcp_oauth_grants_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "mcp_oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_oauth_grants" ADD CONSTRAINT "mcp_oauth_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_oauth_grants" ADD CONSTRAINT "mcp_oauth_grants_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_oauth_tokens" ADD CONSTRAINT "mcp_oauth_tokens_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "mcp_oauth_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
