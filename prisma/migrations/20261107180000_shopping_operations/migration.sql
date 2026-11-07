-- AlterTable
ALTER TABLE "shopping_receipts" ADD COLUMN     "shopId" TEXT;

-- CreateTable
CREATE TABLE "shopping_session_operations" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopping_session_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shopping_session_operations_sessionId_key_key" ON "shopping_session_operations"("sessionId", "key");

-- AddForeignKey
ALTER TABLE "shopping_session_operations" ADD CONSTRAINT "shopping_session_operations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "shopping_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
