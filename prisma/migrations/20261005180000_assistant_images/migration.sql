-- CreateTable
CREATE TABLE "assistant_images" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_images_messageId_idx" ON "assistant_images"("messageId");

-- CreateIndex
CREATE INDEX "assistant_images_userId_createdAt_idx" ON "assistant_images"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "assistant_images" ADD CONSTRAINT "assistant_images_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_images" ADD CONSTRAINT "assistant_images_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "assistant_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
