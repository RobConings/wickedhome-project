-- CreateEnum
CREATE TYPE "InviteKind" AS ENUM ('INVITE', 'PASSWORD_RESET');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "disabledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "invites" (
    "id" TEXT NOT NULL,
    "kind" "InviteKind" NOT NULL DEFAULT 'INVITE',
    "tokenHash" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "habitantId" TEXT,
    "userId" TEXT,
    "role" "Role",
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invites_tokenHash_key" ON "invites"("tokenHash");

-- CreateIndex
CREATE INDEX "invites_householdId_idx" ON "invites"("householdId");

-- CreateIndex
CREATE INDEX "invites_habitantId_idx" ON "invites"("habitantId");

-- CreateIndex
CREATE INDEX "invites_userId_idx" ON "invites"("userId");

-- CreateIndex
CREATE INDEX "invites_expiresAt_idx" ON "invites"("expiresAt");

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_habitantId_fkey" FOREIGN KEY ("habitantId") REFERENCES "habitants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

