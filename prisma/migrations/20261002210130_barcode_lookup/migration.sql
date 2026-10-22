-- CreateTable
CREATE TABLE "barcode_lookups" (
    "code" TEXT NOT NULL,
    "found" BOOLEAN NOT NULL,
    "data" JSONB,
    "imageType" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "barcode_lookups_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "barcode_lookups_fetchedAt_idx" ON "barcode_lookups"("fetchedAt");

